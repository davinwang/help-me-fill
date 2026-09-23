import { useEffect, useState } from 'react';
import { PROVIDERS, BUILTIN, isProvider, type ProviderId, type ProviderSettings as Settings } from '../../ai/registry';
import { detectBuiltin, type BuiltinState } from '../../ai/builtin-support';
import { validateSettings } from '../../ai/provider';
import { errorMessage, UserError } from '../../shared/errors';

type Props = { disabled: boolean; onChange: (settings?: Settings) => void };
export function ProviderSettings({ disabled, onChange }: Props) {
  const [provider, setProvider] = useState<ProviderId>('openai');
  const [model, setModel] = useState<string>(PROVIDERS.openai.defaultModel);
  const [apiKey, setKey] = useState('');
  const [builtin, setBuiltin] = useState<BuiltinState | undefined>(undefined);
  const [status, setStatus] = useState('Configure a provider to generate suggestions.');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      // The on-device option appears only when this browser/device passes the check.
      const support = await detectBuiltin();
      if (!alive) return;
      setBuiltin(support);
      const stored = await chrome.storage.local.get('preferences');
      const preferences = stored.preferences as { provider?: unknown; model?: unknown } | undefined;
      if (!alive || !preferences || !isProvider(preferences.provider) || typeof preferences.model !== 'string') return;
      const id = preferences.provider;
      if (id === 'builtin') {
        if (!support) { setStatus('The saved on-device provider is not available in this browser right now. Choose another provider.'); return; }
        setProvider(id); setModel(BUILTIN.defaultModel);
        onChange({ provider: id, model: BUILTIN.defaultModel, apiKey: '' });
        setStatus('On-device provider restored. Suggestions stay on this device.');
        return;
      }
      const keys = await chrome.storage.session.get(`key:${id}`);
      if (!alive) return;
      const key = typeof keys[`key:${id}`] === 'string' ? keys[`key:${id}`] as string : '';
      setProvider(id); setModel(preferences.model); setKey(key);
      if (key && await chrome.permissions.contains({ origins: [PROVIDERS[id].origin] })) {
        if (!alive) return;
        onChange({ provider: id, model: preferences.model, apiKey: key }); setStatus('Session key restored. Provider/model live verification is not included.');
      }
    })().catch(() => { if (alive) setStatus('Settings could not be restored. Configure the provider again.'); });
    return () => { alive = false; };
  }, [onChange]);
  const dirty = () => { onChange(undefined); setStatus('Unsaved changes. Enable this provider before generating suggestions.'); };
  async function save() {
    try {
      const settings = { provider, model: provider === 'builtin' ? BUILTIN.defaultModel : model.trim(), apiKey: provider === 'builtin' ? '' : apiKey.trim() };
      validateSettings(settings);
      setSaving(true);
      if (provider === 'builtin') {
        if (!await detectBuiltin()) throw new UserError('The on-device model is not available in this browser right now. Choose another provider.');
      } else {
        // This call must remain directly inside the user gesture, before any await.
        const permission = chrome.permissions.request({ origins: [PROVIDERS[provider].origin] });
        if (!await permission) throw new UserError('API host permission was declined. No document was sent.');
        await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
        await chrome.storage.session.set({ [`key:${provider}`]: settings.apiKey });
      }
      await chrome.storage.local.set({ preferences: { provider, model: settings.model } });
      onChange(settings);
      setStatus(provider === 'builtin'
        ? 'On-device provider enabled. Text never leaves this device; on-device accuracy is experimental.'
        : 'Provider enabled. No API request has been made; model compatibility is unverified.');
    } catch (error) { setStatus(errorMessage(error)); }
    finally { setSaving(false); }
  }
  async function remove() {
    try {
      await chrome.storage.session.remove(`key:${provider}`);
      setKey(''); onChange(undefined); setStatus('Session key removed. API host permission can also be revoked below.');
    } catch { setStatus('Could not remove the key. Try again.'); }
  }
  return <details className="card settings" open>
    <summary>LLM provider <span className="subtle">Your key · Direct connection{builtin ? ' · On-device option detected' : ''}</span></summary>
    <fieldset disabled={disabled || saving}>
      <label>Provider<select value={provider} onChange={event => { const id = event.target.value as ProviderId; setProvider(id); setModel(id === 'builtin' ? BUILTIN.defaultModel : PROVIDERS[id].defaultModel); setKey(''); dirty(); }}>
        {Object.entries(PROVIDERS).map(([id, info]) => <option key={id} value={id}>{info.name}</option>)}
        {builtin && <option value="builtin">{BUILTIN.name}</option>}
      </select></label>
      {provider === 'builtin' ? <p className="hint">{builtin === 'available'
        ? 'The browser on-device model is ready. No API key, no network request; extracted text never leaves this device. On-device accuracy is experimental.'
        : 'The browser will download its on-device model on first use; download progress appears during generation. No API key and no network request afterwards.'}</p> : <>
        <label>Model ID<input value={model} placeholder="Model ID from your provider account" autoComplete="off" spellCheck={false} onChange={event => { setModel(event.target.value); dirty(); }} /></label>
        <label>API key<a className="link-button" href={PROVIDERS[provider].keyUrl} target="_blank" rel="noreferrer">Get API key</a><input type="password" value={apiKey} autoComplete="off" spellCheck={false} placeholder="Stored for this browser session only" onChange={event => { setKey(event.target.value); dirty(); }} /></label>
      </>}
      <div className="button-row"><button type="button" onClick={() => void save()}>{provider === 'builtin' ? 'Enable on-device provider' : 'Enable provider'}</button>{provider !== 'builtin' && <button type="button" className="secondary" onClick={() => void remove()}>Remove key</button>}</div>
      {provider !== 'builtin' && <button type="button" className="link-button" onClick={() => {
        void chrome.permissions.remove({ origins: [PROVIDERS[provider].origin] }).then(() => { onChange(undefined); setStatus('API host permission revoked.'); }, () => setStatus('Permission could not be revoked.'));
      }}>Revoke API host permission</button>}
    </fieldset>
    <p className="hint" role="status">{status}</p>
    <p className="hint">Keys are session-only, not an encrypted vault. Provider accounts determine model availability and charges. No backend or subscription is included.</p>
  </details>;
}
