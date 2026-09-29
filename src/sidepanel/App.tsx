import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ProviderSettings } from './components/ProviderSettings';
import { DropZone } from './components/DropZone';
import { DisclosurePreview } from './components/DisclosurePreview';
import { PageFields } from './components/PageFields';
import { FillResults } from './components/FillResults';
import { AutoSendDialog } from './components/AutoSendDialog';
import { parseDocument, mergeDocuments } from '../parsers';
import { createProvider } from '../ai/provider';
import { defaultAutoSend, resolveProvider, type ProviderSettings as Settings } from '../ai/registry';
import { compactFields } from '../ai/prompts';
import { UserError, errorMessage } from '../shared/errors';
import { t } from '../shared/i18n';
import { loadAutoSend, saveAutoSend } from './auto-send';
import { initialSession, sessionReducer, isBusy, syncActivePage, sendPage, executeOnPage, assertActive, fillableRows, type Action, type Phase } from './session';

export function App() {
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const [settings, setSettings] = useState<Settings>();
  const [editing, setEditing] = useState(false);
  // undefined means "not loaded yet or being edited": the consent card only
  // appears on an explicit false, so a restore in flight never flashes it for
  // providers whose derived default is auto (on-device, loopback).
  const [autoSend, setAutoSend] = useState<boolean>();
  // 'enable' comes from the consent-card switch, 'send' from "send & always":
  // both are pending explicit warnings before auto-send is turned on.
  const [dialog, setDialog] = useState<'enable' | 'send'>();
  const latest = useRef(state); latest.current = state;
  const controller = useRef<AbortController | undefined>(undefined);
  const epoch = useRef(0), running = useRef(false), syncing = useRef(false);
  const attempts = useRef(new Set<string>());
  const busy = isBusy(state.phase);

  const abortRun = useCallback(() => {
    if (!running.current) return;
    epoch.current++; controller.current?.abort(); running.current = false; controller.current = undefined;
    dispatch({ type: 'START', phase: 'idle' });
  }, []);
  // Quiet re-detection of the active page. Runs while the panel is open so
  // document selection and field detection stay parallel; pauses only while
  // the content script itself is busy writing.
  const sync = useCallback(async () => {
    if (syncing.current) return;
    const current = latest.current;
    if (current.phase === 'filling' || current.phase === 'undoing') return;
    syncing.current = true;
    try {
      const outcome = await syncActivePage(current.scan);
      if (!outcome.scan) { dispatch({ type: 'DETECT_FAIL', error: outcome.error! }); return; }
      const previous = latest.current.scan;
      // A context switch mid-mapping stops the run: the stale plan would be
      // dropped by the reducer anyway, aborting just saves provider calls.
      if (running.current && latest.current.phase === 'mapping' && previous && outcome.scan.scanId !== previous.scanId) abortRun();
      dispatch({ type: 'DETECT', scan: outcome.scan });
    } finally { syncing.current = false; }
  }, [abortRun]);

  useEffect(() => {
    void sync();
    const timer = setInterval(() => { void sync(); }, 1_000);
    const activated = () => void sync();
    const updated = (tabId: number, info: { status?: string; url?: string }) => {
      const target = latest.current.scan?.target;
      if (!target || (target.tabId === tabId && (info.status === 'loading' || info.url))) void sync();
    };
    const removed = (tabId: number) => { if (latest.current.scan?.target.tabId === tabId) void sync(); };
    // The service worker tells the panel when the toolbar icon granted fresh
    // page access; a panel opened earlier could not detect the grant itself.
    const granted = (message: unknown) => {
      if (!message || typeof message !== 'object' || !('type' in message) || (message as { type?: unknown }).type !== 'ACTION_GRANTED') return;
      const windowId = (message as { windowId?: unknown }).windowId;
      const target = latest.current.scan?.target;
      if (target && typeof windowId === 'number' && target.windowId !== windowId) return;
      void sync();
    };
    const unload = () => {
      epoch.current++; controller.current?.abort();
      const scan = latest.current.scan;
      if (scan) void sendPage(scan.target, { type: 'CLEAR', requestId: crypto.randomUUID() }).catch(() => {});
    };
    chrome.tabs.onActivated.addListener(activated);
    chrome.tabs.onUpdated.addListener(updated);
    chrome.tabs.onRemoved.addListener(removed);
    chrome.runtime.onMessage.addListener(granted);
    window.addEventListener('pagehide', unload);
    return () => {
      clearInterval(timer);
      chrome.tabs.onActivated.removeListener(activated);
      chrome.tabs.onUpdated.removeListener(updated);
      chrome.tabs.onRemoved.removeListener(removed);
      chrome.runtime.onMessage.removeListener(granted);
      window.removeEventListener('pagehide', unload);
      controller.current?.abort();
    };
  }, [sync]);
  // The auto-send preference is stored per provider+endpoint; without a stored
  // override the derived default applies (auto only for on-device/loopback).
  useEffect(() => {
    if (!settings) { setAutoSend(undefined); return; }
    let alive = true;
    void loadAutoSend(settings).then(stored => { if (alive) setAutoSend(stored ?? defaultAutoSend(settings)); });
    return () => { alive = false; };
  }, [settings]);
  // A fill or undo just changed the page: refresh the values right away so a
  // follow-up action is checked against what the page really holds now.
  useEffect(() => { if (state.result) void sync(); }, [state.result, sync]);

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
        ? { type: 'INVALIDATE', error: t('errInspectPartial', [errorMessage(error)]) }
        : { type: 'ERROR', error: errorMessage(error) });
    } finally { if (epoch.current === id) { running.current = false; controller.current = undefined; } }
  }
  function upload(file: File) {
    if (running.current) return;
    const previous = latest.current.documents;
    void run('parsing', async signal => {
      const document = await parseDocument(file, signal, (page, total) => { if (!signal.aborted) dispatch({ type: 'PROGRESS', text: t('progressReadingPage', [page, total]) }); });
      mergeDocuments([...previous, document]); // Enforce the combined text limit before the document joins the session.
      return { type: 'DOCUMENT', document };
    });
  }
  function generate() {
    const current = latest.current;
    if (!settings || !current.documents.length || !current.scan || !current.scan.fields.length) return;
    const config = { ...settings }, document = mergeDocuments(current.documents), snapshot = current.scan;
    void run('mapping', async signal => {
      await assertActive(snapshot.target);
      const info = resolveProvider(config);
      if (info.kind !== 'builtin' && !await chrome.permissions.contains({ origins: [info.origin] })) throw new UserError(t('errHostPermissionMissing'));
      const outcome = await createProvider(config).map({ lines: document.lines, fields: compactFields(snapshot.fields), signal, onProgress: text => { if (!signal.aborted) dispatch({ type: 'PROGRESS', text }); } });
      await assertActive(snapshot.target);
      const seconds = (outcome.elapsedMs / 1000).toFixed(1);
      return { type: 'PLAN', scanId: snapshot.scanId, plan: outcome.plan, metrics: outcome.usage
        ? t('metricsUsage', [info.name, config.model, outcome.calls, seconds, JSON.stringify(outcome.usage)])
        : t('metrics', [info.name, config.model, outcome.calls, seconds]) };
    });
  }
  // The automatic match: one attempt per context snapshot (documents + page +
  // provider); a failure stays visible with a manual retry instead of looping.
  const autoKey = `${state.scan?.scanId ?? ''}|${state.documents.map(document => `${document.name}:${document.characters}`).join('§')}|${settings?.provider ?? ''}|${settings?.model ?? ''}`;
  useEffect(() => {
    if (!settings || !autoSend) return;
    const { documents, scan, plan, scanError, error, phase } = state;
    if (!documents.length || !scan || !scan.fields.length || plan || scanError || error || phase !== 'idle') return;
    if (attempts.current.has(autoKey)) return;
    attempts.current.add(autoKey);
    generate();
  }, [autoKey, settings, autoSend, state]);
  function fill() {
    const current = latest.current;
    if (!current.scan || current.phase !== 'idle') return;
    const snapshot = current.scan;
    // Only switched-on rows with a value are written; the switch is the
    // overwrite consent, so every sent assignment carries allowOverwrite.
    const assignments = fillableRows(current.rows).flatMap(row => {
      const field = snapshot.fields.find(item => item.id === row.fieldId);
      return field ? [{ fieldId: row.fieldId, value: row.value, allowOverwrite: true, expectedValue: field.currentValue }] : [];
    });
    if (!assignments.length) return;
    void run('filling', async () => ({ type: 'RESULT', result: await executeOnPage(snapshot, { type: 'FILL', requestId: crypto.randomUUID(), scanId: snapshot.scanId, expectedUrl: snapshot.url, assignments }) }));
  }
  function undo() {
    const current = latest.current;
    if (!current.scan || !current.result?.canUndo || current.phase !== 'idle') return;
    const snapshot = current.scan;
    void run('undoing', async () => ({ type: 'RESULT', result: await executeOnPage(snapshot, { type: 'UNDO', requestId: crypto.randomUUID(), scanId: snapshot.scanId, expectedUrl: snapshot.url }) }));
  }
  function cancel() {
    controller.current?.abort();
    const scan = latest.current.scan;
    if (scan) void sendPage(scan.target, { type: 'CANCEL', requestId: crypto.randomUUID() }).catch(() => {});
    dispatch({ type: 'PROGRESS', text: t('progressCanceling') });
  }
  const providerChanged = useCallback((value?: Settings) => {
    abortRun();
    setSettings(value); setDialog(undefined); dispatch({ type: 'PROVIDER_CHANGED' });
  }, [abortRun]);
  function changeAutoSend(value: boolean, immediate = false) {
    if (!settings) return;
    // Turning auto-send on for anything that is not clearly local needs the
    // explicit warning first; "send & always" combines it with one send.
    if (value && !defaultAutoSend(settings)) { setDialog(immediate ? 'send' : 'enable'); return; }
    applyAutoSend(value, immediate);
  }
  function applyAutoSend(value: boolean, immediate = false) {
    if (!settings) return;
    setAutoSend(value);
    void saveAutoSend(settings, value);
    if (value && immediate) generate();
  }
  function confirmAutoSend() {
    const action = dialog; setDialog(undefined);
    applyAutoSend(true, action === 'send');
  }

  const scan = state.scan;
  // A detection failure means the active page is not readable right now (no
  // grant, a restricted scheme, a lost connection, an over-large form). The
  // fields, review, and results still in state describe a page the panel can no
  // longer read, so they are hidden instead of shown as if they were current.
  const blocked = !!state.scanError;
  const detected = !blocked && !!scan?.fields.length;
  const review = !blocked && !!state.plan;
  const showSettings = !settings || editing;
  const locked = busy || blocked;
  const needsDocument = detected && !state.documents.length;
  const showConsent = !!settings && autoSend === false && detected && state.documents.length > 0 && !review;
  const step2 = review ? (state.result ? 'done' : 'active') : (settings && detected && state.documents.length ? 'active' : '');
  return <main>
    <header><div className="brand"><span className="brand-icon" aria-hidden="true">h</span><div><h1>help-me-fill</h1><span className="subtle">{t('brandSubtle')}</span></div></div>{settings && <button type="button" className="link-button" disabled={busy} onClick={() => setEditing(value => !value)}>{t('editLlm')}</button>}</header>
    {!settings && <div className="intro"><h2>{t('introTitle')}</h2><p>{t('introBody')}</p></div>}
    {showSettings && <ProviderSettings disabled={busy} onChange={providerChanged} />}
    {state.error && <div className="error" role="alert"><span>{state.error}</span>{autoSend && detected && !!state.documents.length && !review && <button type="button" className="link-button" onClick={generate}>{t('retryMatch')}</button>}</div>}
    {!settings && <p className="hint">{t('configureProviderHint')}</p>}
    {settings && <>
      <ol className="steps" aria-label={t('workflowLabel')}><li className={state.documents.length ? 'done' : 'active'}>1 {t('stepDocument')}</li><li className={step2}>2 {t('stepReview')}</li><li className={state.result ? 'active' : ''}>3 {t('stepFill')}</li></ol>
      {busy && <div className="progress" role="status"><span className="spinner" aria-hidden="true" /><span>{state.progress ?? ({ parsing: t('progressParsing'), mapping: t('progressMapping'), filling: t('progressFilling'), undoing: t('progressUndoing') } as Record<string, string>)[state.phase]}</span><button type="button" className="link-button" onClick={cancel}>{t('cancel')}</button></div>}
      {state.scanError && <div className="notice scan-notice" role="status"><span>{state.scanError}</span><button type="button" className="link-button" onClick={() => void sync()}>{t('retryScan')}</button></div>}
      <div className={needsDocument ? 'attention' : ''}>
        <DropZone disabled={busy} documents={state.documents} onFile={upload} onError={error => dispatch({ type: 'ERROR', error })}
          onRemove={index => { abortRun(); dispatch({ type: 'REMOVE_DOCUMENT', index }); }} />
      </div>
      {needsDocument && <p className="prompt" role="status">{t('selectDocumentPrompt', [scan!.fields.length])}</p>}
      {detected && <PageFields state={state} dispatch={dispatch} disabled={locked} onFill={fill} />}
      {detected && !!state.documents.length && !review && autoSend === true && <p className="hint auto-send-status" role="status">{t('autoSendStatus', [resolveProvider(settings).name])} <button type="button" className="link-button" onClick={() => changeAutoSend(false)}>{t('autoSendOff')}</button></p>}
      {showConsent && <DisclosurePreview document={mergeDocuments(state.documents)} scan={scan!} settings={settings} autoSend={false} disabled={busy} onGenerate={generate} onAutoSend={changeAutoSend} />}
      {!blocked && state.result && scan && <FillResults result={state.result} scan={scan} disabled={locked} onUndo={undo} />}
      {!blocked && !detected && !!scan && <p className="hint">{t('errNoFields')}</p>}
    </>}
    {dialog && settings && <AutoSendDialog settings={settings} onConfirm={confirmAutoSend} onCancel={() => setDialog(undefined)} />}
    <footer>{t('footerNote')}</footer>
  </main>;
}
