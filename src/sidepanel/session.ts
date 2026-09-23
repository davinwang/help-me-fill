import type { ParsedDocument } from '../parsers/types';
import { ScanSchema, OperationResultSchema, type BoundScan, type MappingPlan, type Assignment, type OperationResult, type Target } from '../shared/schemas';
import type { ContentMessage, Reply } from '../shared/messages';
import { UserError } from '../shared/errors';

export type ReviewRow = Assignment & { selected: boolean; allowOverwrite: boolean; manual: boolean };
export type Phase = 'idle' | 'parsing' | 'scanning' | 'ready' | 'mapping' | 'review' | 'filling' | 'complete' | 'undoing';
export type Stage = 'documents' | 'review';
export type Session = {
  phase: Phase; stage: Stage; documents: ParsedDocument[]; scan?: BoundScan; plan?: MappingPlan; rows: ReviewRow[];
  result?: OperationResult; error?: string; progress?: string; metrics?: string;
};
export const initialSession: Session = { phase: 'idle', stage: 'documents', documents: [], rows: [] };
export type Action =
  | { type: 'RESET' }
  | { type: 'START'; phase: Phase }
  | { type: 'PROGRESS'; text: string }
  | { type: 'DOCUMENT'; document: ParsedDocument }
  | { type: 'REMOVE_DOCUMENT'; index: number }
  | { type: 'SCAN'; scan: BoundScan }
  | { type: 'PLAN'; plan: MappingPlan; metrics: string }
  | { type: 'ROW'; fieldId: string; patch: Partial<Pick<ReviewRow, 'value' | 'selected' | 'allowOverwrite' | 'manual'>> }
  | { type: 'SELECT_ALL'; selected: boolean }
  | { type: 'RESULT'; result: OperationResult }
  | { type: 'ERROR'; error: string }
  | { type: 'INVALIDATE'; error?: string }
  | { type: 'BACK' }
  | { type: 'PROVIDER_CHANGED' };
// Adding or removing a document changes the disclosure payload, so any scan,
// plan, or result bound to the previous document set is dropped; the user
// returns to Step 1 and reviews again. Parsed documents themselves persist.
const docChanged = (state: Session, documents: ParsedDocument[]): Session => ({
  phase: documents.length ? 'ready' : 'idle', stage: 'documents', documents,
  scan: undefined, plan: undefined, rows: [], result: undefined, metrics: undefined, progress: undefined, error: undefined,
});
export function sessionReducer(state: Session, action: Action): Session {
  switch (action.type) {
    case 'RESET': return initialSession;
    case 'START': return { ...state, phase: action.phase, error: undefined, progress: undefined };
    case 'PROGRESS': return { ...state, progress: action.text };
    case 'DOCUMENT': return docChanged(state, [...state.documents, action.document]);
    case 'REMOVE_DOCUMENT': return docChanged(state, state.documents.filter((_document, index) => index !== action.index));
    case 'SCAN': return { ...state, phase: 'ready', stage: 'review', scan: action.scan, plan: undefined, rows: [], result: undefined, metrics: undefined, error: undefined };
    case 'PLAN': return { ...state, phase: 'review', plan: action.plan, metrics: action.metrics, result: undefined, rows: action.plan.assignments.map(row => ({ ...row, selected: false, allowOverwrite: false, manual: false })) };
    case 'ROW': return { ...state, rows: state.rows.map(row => row.fieldId === action.fieldId ? { ...row, ...action.patch } : row) };
    case 'SELECT_ALL': return { ...state, rows: state.rows.map(row => ({ ...row, selected: action.selected && (row.allowOverwrite || !state.scan?.fields.find(field => field.id === row.fieldId)?.currentValue) })) };
    case 'RESULT': return { ...state, phase: 'complete', result: action.result, error: undefined };
    case 'ERROR': return { ...state, phase: state.plan ? 'review' : state.documents.length ? 'ready' : 'idle', error: action.error };
    case 'INVALIDATE': return { phase: state.documents.length ? 'ready' : 'idle', stage: 'documents', documents: state.documents, rows: [], error: action.error };
    case 'BACK': return { ...state, phase: state.documents.length ? 'ready' : 'idle', stage: 'documents', plan: undefined, rows: [], result: undefined, metrics: undefined, error: undefined };
    case 'PROVIDER_CHANGED': return { ...state, phase: state.documents.length ? 'ready' : 'idle', stage: 'documents', scan: undefined, plan: undefined, rows: [], result: undefined, metrics: undefined, error: undefined };
  }
}
export const isBusy = (phase: Phase) => ['parsing', 'scanning', 'mapping', 'filling', 'undoing'].includes(phase);

export async function assertActive(target: Target) {
  const [tab] = await chrome.tabs.query({ active: true, windowId: target.windowId });
  if (tab?.id !== target.tabId || tab.url !== target.url) throw new UserError('The target tab or page changed. Scan and review again.');
}
export async function sendPage<T>(target: Target, message: ContentMessage): Promise<T> {
  let reply: Reply<T>;
  try { reply = await chrome.tabs.sendMessage(target.tabId, message, { documentId: target.documentId }); }
  catch { throw new UserError('The page connection was lost. Click the toolbar icon on the form page, then scan again.'); }
  if (!reply || !reply.ok) throw new UserError(reply && !reply.ok ? reply.error : 'The page returned an invalid response.');
  return reply.data;
}
export async function scanActivePage(): Promise<BoundScan> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) throw new UserError('Open an HTTP(S) form page and click the help-me-fill toolbar icon to grant access.');
  const url = new URL(tab.url);
  if (['chromewebstore.google.com', 'chrome.google.com', 'microsoftedge.microsoft.com'].includes(url.hostname)) throw new UserError('Browser extension stores cannot be filled. Open a normal form page.');
  let injection: chrome.scripting.InjectionResult[];
  try { injection = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ['content/index.js'] }); }
  catch { throw new UserError('Page access was denied. Click the extension toolbar icon on this tab, then scan again. Restricted pages are not supported.'); }
  const documentId = injection.find(result => result.frameId === 0)?.documentId;
  if (!documentId) throw new UserError('The browser did not provide a document identity. Update the browser and try again.');
  const target: Target = { tabId: tab.id, windowId: tab.windowId, documentId, url: tab.url };
  await assertActive(target);
  const scan = ScanSchema.parse(await sendPage(target, { type: 'SCAN', requestId: crypto.randomUUID(), expectedUrl: target.url }));
  if (scan.url !== target.url) throw new UserError('The page changed while scanning. Try again.');
  return { ...scan, target };
}
export async function executeOnPage(scan: BoundScan, message: Extract<ContentMessage, { type: 'FILL' | 'UNDO' }>): Promise<OperationResult> {
  await assertActive(scan.target);
  const port = chrome.tabs.connect(scan.target.tabId, { documentId: scan.target.documentId, name: `help-me-fill:${message.requestId}` });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new UserError('The page did not acknowledge the review panel. Scan again.')), 3_000);
      const ready = (data: unknown) => {
        if (data && typeof data === 'object' && 'ready' in data && data.ready === true) { clearTimeout(timeout); port.onMessage.removeListener(ready); resolve(); }
      };
      port.onMessage.addListener(ready);
      port.onDisconnect.addListener(() => { void chrome.runtime.lastError; clearTimeout(timeout); reject(new UserError('The page connection closed. Scan again.')); });
    });
    return OperationResultSchema.parse(await sendPage(scan.target, message));
  } finally { port.disconnect(); }
}
