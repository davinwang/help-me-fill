import type { ParsedDocument } from '../parsers/types';
import { ScanSchema, OperationResultSchema, type BoundScan, type FieldDescriptor, type LocalField, type MappingPlan, type OperationResult, type Target } from '../shared/schemas';
import type { ContentMessage, Reply } from '../shared/messages';
import { UserError, errorMessage } from '../shared/errors';
import { t } from '../shared/i18n';

// A review row is one AI-matched field. `value` is what a fill would write —
// the matched value or the user's hand-edit. `useAi` is the per-field switch
// ("use the matched value instead of the page value"); `manual` marks rows the
// user edited by hand.
export type ReviewRow = {
  fieldId: string;
  value: string;
  evidence: { lineId: string; quote: string }[];
  reason: string;
  useAi: boolean;
  manual: boolean;
};
// Foreground operations only. Detection runs quietly in the background the
// whole time, so there is no "scanning" or "ready" phase anymore: the single
// page is always live and `plan` marks the review stage.
export type Phase = 'idle' | 'parsing' | 'mapping' | 'filling' | 'undoing';
export type Session = {
  phase: Phase;
  documents: ParsedDocument[];
  scan?: BoundScan;
  scanError?: string;
  plan?: MappingPlan;
  rows: ReviewRow[];
  result?: OperationResult;
  error?: string;
  progress?: string;
  metrics?: string;
};
export const initialSession: Session = { phase: 'idle', documents: [], rows: [] };
export type Action =
  | { type: 'RESET' }
  | { type: 'START'; phase: Phase }
  | { type: 'PROGRESS'; text: string }
  | { type: 'DOCUMENT'; document: ParsedDocument }
  | { type: 'REMOVE_DOCUMENT'; index: number }
  | { type: 'DETECT'; scan: BoundScan }
  | { type: 'DETECT_FAIL'; error: string }
  | { type: 'PLAN'; scanId: string; plan: MappingPlan; metrics: string }
  | { type: 'ROW'; fieldId: string; patch: Partial<Pick<ReviewRow, 'value' | 'useAi' | 'manual'>> }
  | { type: 'SELECT_ALL'; useAi: boolean }
  | { type: 'RESULT'; result: OperationResult }
  | { type: 'ERROR'; error: string }
  | { type: 'INVALIDATE'; error?: string }
  | { type: 'PROVIDER_CHANGED' };

// Signature used to pair fields across re-renders that replace DOM nodes:
// metadata order survives even when field ids (element identity) do not.
export function fieldSignature(field: FieldDescriptor): string {
  return JSON.stringify([field.type, field.label, field.ariaLabel, field.placeholder, field.name, field.context, field.required, field.maxLength, field.pattern, field.options ?? []]);
}
const scanSignatures = (scan: BoundScan) => scan.fields.map(fieldSignature).join('\u0000');
// A field "holds" a value when filling it means replacing something: unchecked
// boxes hold nothing, anything else non-empty does.
const held = (field: LocalField) => field.type === 'checkbox' ? field.currentValue === 'true' : field.currentValue !== '';
// Rows armed by default: empty page fields. Occupied fields stay off and show
// the page value until the user flips the switch — review-first, no silent
// overwrites. The master switch can flip the whole list either way.
function buildRows(plan: MappingPlan, scan?: BoundScan): ReviewRow[] {
  return plan.assignments.map(assignment => {
    const field = scan?.fields.find(item => item.id === assignment.fieldId);
    return { fieldId: assignment.fieldId, value: assignment.value, evidence: assignment.evidence, reason: assignment.reason, useAi: field ? !held(field) : false, manual: false };
  });
}
function rekeyRows(rows: ReviewRow[], map: Map<string, string>): ReviewRow[] {
  return rows.map(row => ({ ...row, fieldId: map.get(row.fieldId) ?? row.fieldId }));
}
function rekeyPlan(plan: MappingPlan, map: Map<string, string>): MappingPlan {
  return {
    assignments: plan.assignments.map(item => ({ ...item, fieldId: map.get(item.fieldId) ?? item.fieldId })),
    unmapped: plan.unmapped.map(item => ({ ...item, fieldId: map.get(item.fieldId) ?? item.fieldId })),
  };
}
function rekeyResult(result: OperationResult, map: Map<string, string>): OperationResult {
  return { ...result, results: result.results.map(item => ({ ...item, fieldId: map.get(item.fieldId) ?? item.fieldId })) };
}
// Adding or removing a document changes the disclosure payload, so the plan
// and its rows are dropped and matching runs again. Detection is independent
// and survives; parsed documents themselves persist. The foreground phase ends
// here: a document change is always the last step of its own run, and a stuck
// phase would keep every control disabled.
function docsChanged(state: Session, documents: ParsedDocument[]): Session {
  return { ...state, phase: 'idle', documents, plan: undefined, rows: [], result: undefined, metrics: undefined, progress: undefined, error: undefined };
}
// Reconciliation across quiet re-detections:
// - Same scan id: values only changed — refresh them and keep everything,
//   including manual edits and switches.
// - Same page and an identical field list: a re-render replaced the DOM nodes.
//   Ids changed, so rows, plan, and results are re-keyed onto the new ids.
// - Anything else: a different page or structure. The context is gone, so the
//   plan, rows, and results are dropped (auto matching will run again).
function detected(state: Session, scan: BoundScan): Session {
  const previous = state.scan;
  if (previous && previous.scanId === scan.scanId && previous.url === scan.url) return { ...state, scan, scanError: undefined };
  const carried = previous && previous.url === scan.url && scanSignatures(previous) === scanSignatures(scan) && Boolean(state.rows.length || state.plan || state.result);
  if (!carried) return { ...state, scan, scanError: undefined, plan: undefined, rows: [], result: undefined, metrics: undefined, error: undefined };
  const map = new Map(previous.fields.map((field, index) => [field.id, scan.fields[index].id]));
  return {
    ...state, scan, scanError: undefined,
    plan: state.plan && rekeyPlan(state.plan, map),
    rows: rekeyRows(state.rows, map),
    result: state.result && rekeyResult(state.result, map),
  };
}
export function sessionReducer(state: Session, action: Action): Session {
  switch (action.type) {
    case 'RESET': return initialSession;
    case 'START': return { ...state, phase: action.phase, error: undefined, progress: undefined };
    case 'PROGRESS': return { ...state, progress: action.text };
    case 'DOCUMENT': return docsChanged(state, [...state.documents, action.document]);
    case 'REMOVE_DOCUMENT': return docsChanged(state, state.documents.filter((_document, index) => index !== action.index));
    case 'DETECT': return detected(state, action.scan);
    // Failing to read the active page (no grant, chrome:// tab, ...) is quiet:
    // the previous page's review stays intact in case the user comes back.
    case 'DETECT_FAIL': return { ...state, scanError: action.error };
    case 'PLAN': {
      // A context switch mid-mapping must not resurrect a stale plan.
      if (!state.scan || state.scan.scanId !== action.scanId) return state;
      return { ...state, phase: 'idle', plan: action.plan, metrics: action.metrics, rows: buildRows(action.plan, state.scan), error: undefined, progress: undefined };
    }
    case 'ROW': return { ...state, rows: state.rows.map(row => row.fieldId === action.fieldId ? { ...row, ...action.patch } : row) };
    case 'SELECT_ALL': return { ...state, rows: state.rows.map(row => ({ ...row, useAi: action.useAi })) };
    case 'RESULT': return { ...state, phase: 'idle', result: action.result, error: undefined, progress: undefined };
    case 'ERROR': return { ...state, phase: 'idle', error: action.error, progress: undefined };
    case 'INVALIDATE': return { ...state, phase: 'idle', plan: undefined, rows: [], result: undefined, metrics: undefined, error: action.error, progress: undefined };
    case 'PROVIDER_CHANGED': return { ...state, phase: 'idle', plan: undefined, rows: [], result: undefined, metrics: undefined, error: undefined, progress: undefined };
  }
}
export const isBusy = (phase: Phase) => phase !== 'idle';
// Everything a fill would write: the switch on and a value to write.
export const fillableRows = (rows: ReviewRow[]) => rows.filter(row => row.useAi && row.value !== '');

export async function assertActive(target: Target) {
  const [tab] = await chrome.tabs.query({ active: true, windowId: target.windowId });
  if (tab?.id !== target.tabId || tab.url !== target.url) throw new UserError(t('errTargetChanged'));
}
export async function sendPage<T>(target: Target, message: ContentMessage): Promise<T> {
  let reply: Reply<T>;
  try { reply = await chrome.tabs.sendMessage(target.tabId, message, { documentId: target.documentId }); }
  catch { throw new UserError(t('errConnectionLost')); }
  if (!reply || !reply.ok) throw new UserError(reply && !reply.ok ? reply.error : t('errInvalidResponse'));
  return reply.data;
}
// Inject the content script into the active tab and bind a target to it. A page
// the extension cannot read (no activeTab grant, a restricted scheme, or a
// blocked injection) reports "no form detected" with the toolbar-icon hint —
// distinct from a readable page that simply holds no fillable fields.
async function injectActive(): Promise<Target> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) throw new UserError(t('errNoFormAccess'));
  const url = new URL(tab.url);
  if (['chromewebstore.google.com', 'chrome.google.com', 'microsoftedge.microsoft.com'].includes(url.hostname)) throw new UserError(t('errStorePage'));
  let injection: chrome.scripting.InjectionResult[];
  try { injection = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ['content/index.js'] }); }
  catch { throw new UserError(t('errNoFormAccess')); }
  const documentId = injection.find(result => result.frameId === 0)?.documentId;
  if (!documentId) throw new UserError(t('errNoDocumentId'));
  const target: Target = { tabId: tab.id, windowId: tab.windowId, documentId, url: tab.url };
  await assertActive(target);
  return target;
}
// Quiet re-detection of the active page. Reuses the previous target while the
// user is on the same document (so field ids stay stable), falls back to a
// fresh injection, and reports failure as data instead of throwing: an
// unscannable page is a normal state, not an error.
export async function syncActivePage(previous?: BoundScan): Promise<{ scan?: BoundScan; error?: string }> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (previous && tab?.id === previous.target.tabId && tab.windowId === previous.target.windowId && tab.url === previous.target.url) {
      try {
        const scan = ScanSchema.parse(await sendPage(previous.target, { type: 'SYNC', requestId: crypto.randomUUID(), expectedUrl: previous.target.url }));
        if (scan.url !== previous.target.url) throw new UserError(t('errPageChangedScanning'));
        return { scan: { ...scan, target: previous.target } };
      } catch { /* the content script may be gone after a reload; inject again below */ }
    }
    const target = await injectActive();
    const scan = ScanSchema.parse(await sendPage(target, { type: 'SYNC', requestId: crypto.randomUUID(), expectedUrl: target.url }));
    if (scan.url !== target.url) throw new UserError(t('errPageChangedScanning'));
    return { scan: { ...scan, target } };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}
export async function executeOnPage(scan: BoundScan, message: Extract<ContentMessage, { type: 'FILL' | 'UNDO' }>): Promise<OperationResult> {
  await assertActive(scan.target);
  const port = chrome.tabs.connect(scan.target.tabId, { documentId: scan.target.documentId, name: `help-me-fill:${message.requestId}` });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new UserError(t('errNoAck'))), 3_000);
      const ready = (data: unknown) => {
        if (data && typeof data === 'object' && 'ready' in data && data.ready === true) { clearTimeout(timeout); port.onMessage.removeListener(ready); resolve(); }
      };
      port.onMessage.addListener(ready);
      port.onDisconnect.addListener(() => { void chrome.runtime.lastError; clearTimeout(timeout); reject(new UserError(t('errConnectionClosed'))); });
    });
    return OperationResultSchema.parse(await sendPage(scan.target, message));
  } finally { port.disconnect(); }
}
