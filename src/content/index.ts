import { ContentMessageSchema, type ContentMessage, type Reply } from '../shared/messages';
import { scanPage, type Registry } from './scan';
import { executeFill, type UndoEntry } from './fill';
import { undoFill } from './undo';
import { UserError, errorMessage } from '../shared/errors';
import { t } from '../shared/i18n';

const state = globalThis as typeof globalThis & { __helpMeFillInstalled?: boolean };
if (!state.__helpMeFillInstalled) {
  state.__helpMeFillInstalled = true;
  let registry: Registry | undefined, undo: UndoEntry[] = [], busy = false, canceled = false;
  const completed = new Map<string, Promise<Reply<unknown>>>();
  const connections = new Set<string>();
  const trusted = (sender?: chrome.runtime.MessageSender) => sender?.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('sidepanel/index.html') && !sender.tab;
  // A live panel port is required throughout execution. Closing the panel cancels remaining writes.
  chrome.runtime.onConnect.addListener(port => {
    if (!trusted(port.sender) || !/^help-me-fill:[0-9a-f-]{36}$/.test(port.name)) { port.disconnect(); return; }
    const id = port.name.slice('help-me-fill:'.length);
    connections.add(id);
    port.onDisconnect.addListener(() => connections.delete(id));
    port.postMessage({ ready: true });
  });
  async function handle(message: ContentMessage): Promise<unknown> {
    if (message.type === 'CANCEL') { canceled = true; return null; }
    if (message.type === 'CLEAR') { canceled = true; registry = undefined; undo = []; completed.clear(); return null; }
    if (busy) throw new UserError(t('idxBusy'));
    if (message.type === 'SCAN') {
      if (location.href !== message.expectedUrl) throw new UserError(t('idxPageChanged'));
      completed.clear(); undo = []; registry = scanPage(); canceled = false;
      return registry.scan;
    }
    if (!registry) throw new UserError(t('idxScanFirst'));
    if (!connections.has(message.requestId)) throw new UserError(t('idxPanelDisconnected'));
    const snapshot = registry;
    const guard = {
      canceled: () => canceled || !connections.has(message.requestId),
      authorize: async () => {
        try { return await chrome.runtime.sendMessage({ type: 'CHECK_ACTIVE', expectedUrl: message.expectedUrl }) === true; }
        catch { return false; }
      },
    };
    busy = true; canceled = false;
    try {
      if (message.type === 'FILL') {
        undo = [];
        const results = await executeFill(snapshot, message.assignments, message.expectedUrl, message.scanId, guard, undo);
        return { results, canUndo: undo.length > 0 };
      }
      const entries = undo;
      const results = await undoFill(snapshot, entries, message.expectedUrl, message.scanId, guard);
      undo = [];
      return { results, canUndo: false };
    } finally { busy = false; }
  }
  chrome.runtime.onMessage.addListener((raw: unknown, sender, respond) => {
    if (!trusted(sender)) return false;
    const parsed = ContentMessageSchema.safeParse(raw);
    if (!parsed.success) { respond({ ok: false, error: t('idxInvalidMessage') }); return false; }
    const message = parsed.data;
    let task = completed.get(message.requestId);
    if (!task) {
      task = handle(message).then(data => ({ ok: true as const, data }), error => ({ ok: false as const, error: errorMessage(error) }));
      if (message.type === 'FILL' || message.type === 'UNDO') {
        if (completed.size >= 20) completed.delete(completed.keys().next().value!);
        completed.set(message.requestId, task);
      }
    }
    void task.then(respond);
    return true;
  });
  window.addEventListener('pagehide', () => { canceled = true; registry = undefined; undo = []; connections.clear(); completed.clear(); });
}
