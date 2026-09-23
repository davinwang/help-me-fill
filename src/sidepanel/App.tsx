import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ProviderSettings } from './components/ProviderSettings';
import { DropZone } from './components/DropZone';
import { DocumentPreview } from './components/DocumentPreview';
import { DisclosurePreview } from './components/DisclosurePreview';
import { ReviewTable } from './components/ReviewTable';
import { FillResults } from './components/FillResults';
import { parseDocument, mergeDocuments } from '../parsers';
import { createProvider } from '../ai/provider';
import { PROVIDERS, BUILTIN, type ProviderSettings as Settings } from '../ai/registry';
import { compactFields } from '../ai/prompts';
import { UserError, errorMessage } from '../shared/errors';
import { initialSession, sessionReducer, isBusy, scanActivePage, sendPage, executeOnPage, assertActive, type Action, type Phase } from './session';

export function App() {
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const [settings, setSettings] = useState<Settings>();
  const [editing, setEditing] = useState(false);
  const latest = useRef(state); latest.current = state;
  const controller = useRef<AbortController | undefined>(undefined);
  const epoch = useRef(0), running = useRef(false);
  const busy = isBusy(state.phase);
  const clearPage = useCallback(() => {
    const scan = latest.current.scan;
    if (scan) void sendPage(scan.target, { type: 'CLEAR', requestId: crypto.randomUUID() }).catch(() => {});
  }, []);
  const invalidate = useCallback((message: string) => {
    epoch.current++; controller.current?.abort(); clearPage(); running.current = false;
    dispatch({ type: 'INVALIDATE', error: message });
  }, [clearPage]);
  const providerChanged = useCallback((value?: Settings) => {
    setSettings(value); dispatch({ type: 'PROVIDER_CHANGED' });
  }, []);
  useEffect(() => {
    const activated = ({ tabId, windowId }: { tabId: number; windowId: number }) => {
      const target = latest.current.scan?.target;
      if (target && target.windowId === windowId && target.tabId !== tabId) invalidate('The active tab changed. Click the toolbar icon on the intended page, then scan and review again.');
    };
    const updated = (tabId: number, info: { status?: string; url?: string }) => {
      const target = latest.current.scan?.target;
      if (target?.tabId === tabId && (info.status === 'loading' || (info.url && info.url !== target.url))) invalidate('The document or route changed. Scan and review again.');
    };
    const removed = (tabId: number) => { if (latest.current.scan?.target.tabId === tabId) invalidate('The target tab was closed.'); };
    const unload = () => { epoch.current++; controller.current?.abort(); clearPage(); };
    chrome.tabs.onActivated.addListener(activated); chrome.tabs.onUpdated.addListener(updated); chrome.tabs.onRemoved.addListener(removed);
    window.addEventListener('pagehide', unload);
    return () => { chrome.tabs.onActivated.removeListener(activated); chrome.tabs.onUpdated.removeListener(updated); chrome.tabs.onRemoved.removeListener(removed); window.removeEventListener('pagehide', unload); controller.current?.abort(); };
  }, [invalidate, clearPage]);

  async function run(phase: Phase, task: (signal: AbortSignal) => Promise<Action>) {
    if (running.current) return;
    running.current = true;
    const id = ++epoch.current, abort = new AbortController(); controller.current = abort;
    dispatch({ type: 'START', phase });
    try {
      const action = await task(abort.signal);
      if (epoch.current === id) dispatch(action);
    } catch (error) {
      if (epoch.current === id) dispatch(phase === 'filling' || phase === 'undoing'
        ? { type: 'INVALIDATE', error: `${errorMessage(error)} Inspect the page for partial changes before rescanning.` }
        : { type: 'ERROR', error: errorMessage(error) });
    } finally { if (epoch.current === id) { running.current = false; controller.current = undefined; } }
  }
  function upload(file: File) {
    if (running.current) return;
    const previous = latest.current.documents;
    void run('parsing', async signal => {
      const document = await parseDocument(file, signal, (page, total) => { if (!signal.aborted) dispatch({ type: 'PROGRESS', text: `Reading page ${page} of ${total} locally…` }); });
      mergeDocuments([...previous, document]); // Enforce the combined text limit before the document joins the session.
      return { type: 'DOCUMENT', document };
    });
  }
  function scan() {
    clearPage();
    void run('scanning', async () => {
      const scan = await scanActivePage();
      if (!scan.fields.length) throw new UserError('No supported fields were found on this page.');
      return { type: 'SCAN', scan };
    });
  }
  function generate() {
    if (!settings || !state.documents.length || !state.scan) return;
    const config = { ...settings }, document = mergeDocuments(state.documents), snapshot = state.scan;
    void run('mapping', async signal => {
      await assertActive(snapshot.target);
      const info = config.provider === 'builtin' ? BUILTIN : PROVIDERS[config.provider];
      if (config.provider !== 'builtin' && !await chrome.permissions.contains({ origins: [info.origin] })) throw new UserError('API host permission is missing. Enable the provider again.');
      const outcome = await createProvider(config).map({ lines: document.lines, fields: compactFields(snapshot.fields), signal, onProgress: text => { if (!signal.aborted) dispatch({ type: 'PROGRESS', text }); } });
      await assertActive(snapshot.target);
      return { type: 'PLAN', plan: outcome.plan, metrics: `${info.name} · ${config.model} · ${outcome.calls} request(s) · ${(outcome.elapsedMs / 1000).toFixed(1)} s${outcome.usage ? ` · usage: ${JSON.stringify(outcome.usage)}` : ''}` };
    });
  }
  function fill() {
    if (!state.scan || state.phase !== 'review') return;
    const snapshot = state.scan;
    const assignments = state.rows.filter(row => row.selected).map(row => ({ fieldId: row.fieldId, value: row.value, allowOverwrite: row.allowOverwrite, expectedValue: snapshot.fields.find(field => field.id === row.fieldId)!.currentValue }));
    if (!assignments.length) return;
    void run('filling', async () => ({ type: 'RESULT', result: await executeOnPage(snapshot, { type: 'FILL', requestId: crypto.randomUUID(), scanId: snapshot.scanId, expectedUrl: snapshot.url, assignments }) }));
  }
  function undo() {
    if (!state.scan || !state.result?.canUndo) return;
    const snapshot = state.scan;
    void run('undoing', async () => ({ type: 'RESULT', result: await executeOnPage(snapshot, { type: 'UNDO', requestId: crypto.randomUUID(), scanId: snapshot.scanId, expectedUrl: snapshot.url }) }));
  }
  function cancel() {
    controller.current?.abort();
    const scan = state.scan;
    if (scan) void sendPage(scan.target, { type: 'CANCEL', requestId: crypto.randomUUID() }).catch(() => {});
    dispatch({ type: 'PROGRESS', text: 'Canceling remaining work. Already filled fields may remain; inspect the results.' });
  }
  const boundScan = settings && state.stage === 'review' ? state.scan : undefined;
  return <main>
    <header><div className="brand"><span className="brand-icon" aria-hidden="true">h</span><div><h1>help-me-fill</h1><span className="subtle">帮我填</span></div></div>{settings && <button type="button" className="link-button" disabled={busy} onClick={() => setEditing(value => !value)}>Edit LLM</button>}</header>
    {!settings && <>
      <div className="intro"><h2>Your document. The right fields.</h2><p>Extract locally, review with AI, then fill on your terms.</p></div>
      <ProviderSettings disabled={busy} onChange={providerChanged} />
      {state.error && <div className="error" role="alert">{state.error}</div>}
      <p className="hint">Configure a provider to start. Document text extraction runs locally in this browser; the provider is contacted only after you approve sending the extracted text and field metadata.</p>
    </>}
    {settings && <>
      {editing && <ProviderSettings disabled={busy} onChange={providerChanged} />}
      {state.error && <div className="error" role="alert">{state.error}</div>}
      <ol className="steps" aria-label="Workflow"><li className={state.stage === 'review' ? 'done' : 'active'}>1 Document</li><li className={state.plan || state.result ? 'done' : boundScan ? 'active' : ''}>2 Review</li><li className={state.result ? 'done' : state.plan ? 'active' : ''}>3 Fill</li></ol>
      {busy && <div className="progress" role="status"><span className="spinner" aria-hidden="true" /><span>{state.progress ?? ({ parsing: 'Extracting document text locally…', scanning: 'Reading supported page fields…', mapping: 'Waiting for your provider…', filling: 'Filling and verifying selected fields…', undoing: 'Restoring unchanged values…' } as Record<string, string>)[state.phase]}</span><button type="button" className="link-button" onClick={cancel}>Cancel</button></div>}
      {!boundScan && <>
        <DropZone disabled={busy} onFile={upload} onError={error => dispatch({ type: 'ERROR', error })} />
        {state.documents.map((document, index) => <DocumentPreview key={`${document.name}-${index}`} document={document} disabled={busy} onRemove={() => { clearPage(); dispatch({ type: 'REMOVE_DOCUMENT', index }); }} />)}
        <button type="button" className="wide" disabled={busy || !state.documents.length} onClick={scan}>AI help me fill</button>
      </>}
      {boundScan && <>
        <button type="button" className="link-button back" disabled={busy} onClick={() => { clearPage(); dispatch({ type: 'BACK' }); }}>← Back to documents</button>
        {!state.plan && <DisclosurePreview document={mergeDocuments(state.documents)} scan={boundScan} settings={settings} disabled={busy} onGenerate={generate} />}
        {state.plan && <ReviewTable state={state} dispatch={dispatch} disabled={busy || state.phase === 'complete'} onFill={fill} />}
        {state.result && <FillResults result={state.result} scan={boundScan} disabled={busy} onUndo={undo} />}
      </>}
    </>}
    <footer>Document parsing stays local. AI suggestions send extracted text and field metadata to your chosen provider after consent. Closing this panel may cancel work; requests are never resumed automatically.</footer>
  </main>;
}
