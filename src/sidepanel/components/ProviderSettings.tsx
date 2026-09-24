import { useEffect, useState } from 'react';
import { PROVIDERS, BUILTIN, CUSTOM, isProvider, localEndpointOrigin, type ProviderId, type ProviderKind, type ProviderSettings as Settings } from '../../ai/registry';
import { detectBuiltin, type BuiltinState } from '../../ai/builtin-support';
import { validateSettings } from '../../ai/provider';
import { errorMessage, UserError } from '../../shared/errors';
import { openSecret, sealSecret } from '../../shared/secret-box';

// The custom preset has no registry entry; these helpers keep the select total.
function kindOf(id: ProviderId): ProviderKind {
  if (id === 'builtin') return 'builtin';
  if (id === 'custom') return 'local';
  return PROVIDERS[id].kind;
}
function defaultModelFor(id: ProviderId): string {
  if (id === 'builtin') return BUILTIN.defaultModel;
  if (id === 'custom') return '';
  return PROVIDERS[id].defaultModel;
}
function nameOf(id: ProviderId): string {
  if (id === 'builtin') return BUILTIN.name;
  if (id === 'custom') return CUSTOM.name;
  return PROVIDERS[id].name;
}
function originFor(id: ProviderId, endpoint?: string): string {
  if (id === 'builtin') return '';
  if (id === 'custom') return localEndpointOrigin(endpoint ?? '');
  return PROVIDERS[id].origin;
}
const KIND_META: Record<ProviderKind, { icon: string; label: string }> = {
  cloud: { icon: '☁️', label: 'Cloud' },
  local: { icon: '🏠', label: 'Local' },
  builtin: { icon: '📱', label: 'On-device' },
};

type Props = { disabled: boolean; onChange: (settings?: Settings) => void };
export function ProviderSettings({ disabled, onChange }: Props) {
  const [provider, setProvider] = useState<ProviderId>('openai');
  const [model, setModel] = useState<string>(PROVIDERS.openai.defaultModel);
  const [apiKey, setKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
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
      const preferences = stored.preferences as { provider?: unknown; model?: unknown; endpoint?: unknown } | undefined;
      if (!alive || !preferences || !isProvider(preferences.provider) || typeof preferences.model !== 'string') return;
      const id = preferences.provider;
      if (id === 'builtin') {
        if (!support) { setStatus('The saved on-device provider is not available in this browser right now. Choose another provider.'); return; }
        setProvider(id); setModel(BUILTIN.defaultModel);
        onChange({ provider: id, model: BUILTIN.defaultModel, apiKey: '' });
        setStatus('On-device provider restored. Suggestions stay on this device.');
        return;
      }
      const savedEndpoint = id === 'custom' && typeof preferences.endpoint === 'string' ? preferences.endpoint : '';
      if (id === 'custom' && !savedEndpoint) { setStatus('The saved custom endpoint is missing. Configure it again.'); return; }
      // The key is stored sealed (AES-GCM) in local storage; open it in memory only.
      const keyStore = await chrome.storage.local.get(`key:${id}`);
      if (!alive) return;
      const sealed = typeof keyStore[`key:${id}`] === 'string' ? keyStore[`key:${id}`] as string : '';
      const key = sealed ? await openSecret(sealed) : '';
      if (!alive) return;
      setProvider(id); setModel(preferences.model); setKey(key); if (id === 'custom') setEndpoint(savedEndpoint);
      // Local servers may have no key; the granted host permission is the gate.
      if (originFor(id, savedEndpoint) && await chrome.permissions.contains({ origins: [originFor(id, savedEndpoint)] })) {
        if (!alive) return;
        onChange({ provider: id, model: preferences.model, apiKey: key, ...(id === 'custom' ? { endpoint: savedEndpoint } : {}) });
        setStatus(kindOf(id) === 'local' ? 'Local provider restored. Requests stay on this machine.' : 'Stored key restored. Provider/model live verification is not included.');
      }
    })().catch(() => { if (alive) setStatus('Settings could not be restored. Configure the provider again.'); });
    return () => { alive = false; };
  }, [onChange]);
  const dirty = () => { onChange(undefined); setStatus('Unsaved changes. Enable this provider before generating suggestions.'); };
  async function save() {
    try {
      const settings: Settings = {
        provider,
        model: provider === 'builtin' ? BUILTIN.defaultModel : model.trim(),
        apiKey: provider === 'builtin' ? '' : apiKey.trim(),
        ...(provider === 'custom' ? { endpoint: endpoint.trim() } : {}),
      };
      validateSettings(settings);
      setSaving(true);
      if (provider === 'builtin') {
        if (!await detectBuiltin()) throw new UserError('The on-device model is not available in this browser right now. Choose another provider.');
      } else {
        // This call must remain directly inside the user gesture, before any await.
        const permission = chrome.permissions.request({ origins: [originFor(provider, settings.endpoint)] });
        if (!await permission) throw new UserError('Host permission was declined. No document was sent.');
        // Seal the key with AES-GCM before it ever reaches persistent storage.
        await chrome.storage.local.set({ [`key:${provider}`]: await sealSecret(settings.apiKey) });
      }
      await chrome.storage.local.set({ preferences: { provider, model: settings.model, ...(provider === 'custom' ? { endpoint: settings.endpoint } : {}) } });
      onChange(settings);
      setStatus(provider === 'builtin'
        ? 'On-device provider enabled. Text never leaves this device; on-device accuracy is experimental.'
        : kindOf(provider) === 'local'
          ? 'Local provider enabled. Requests stay on this machine; nothing is sent to the cloud. Model compatibility is unverified.'
          : 'Provider enabled. No API request has been made; model compatibility is unverified.');
    } catch (error) { setStatus(errorMessage(error)); }
    finally { setSaving(false); }
  }
  async function remove() {
    try {
      await chrome.storage.local.remove(`key:${provider}`);
      setKey(''); onChange(undefined); setStatus('Stored key removed. Host permission can also be revoked below.');
    } catch { setStatus('Could not remove the key. Try again.'); }
  }
  const kind = kindOf(provider);
  const meta = KIND_META[kind];
  return <details className="card settings" open>
    <summary>LLM provider <span className="subtle">Cloud · Local · On-device{builtin ? ' · On-device option detected' : ''}</span></summary>
    <fieldset disabled={disabled || saving}>
      <label>Provider
        <select value={provider} onChange={event => { const id = event.target.value as ProviderId; setProvider(id); setModel(defaultModelFor(id)); setKey(''); dirty(); }}>
          {Object.entries(PROVIDERS).map(([id, info]) => <option key={id} value={id}>{`${info.name} — ${info.kind === 'local' ? '🏠 Local' : '☁️ Cloud'}`}</option>)}
          <option value="custom">{`${CUSTOM.name} — 🔧 Local`}</option>
          {builtin && <option value="builtin">{`${BUILTIN.name} — 📱 On-device`}</option>}
        </select>
        <span className={`badge badge-${kind}`} title={`${meta.label} provider`}>{meta.icon} {meta.label}</span>
      </label>
      {provider === 'builtin' ? <p className="hint">{builtin === 'available'
        ? 'The browser on-device model is ready. No API key, no network request; extracted text never leaves this device. On-device accuracy is experimental.'
        : 'The browser will download its on-device model on first use; download progress appears during generation. No API key and no network request afterwards.'}</p> : <>
        {provider === 'custom' && <label>Endpoint URL<input value={endpoint} placeholder="http://localhost:11434/v1/chat/completions" autoComplete="off" spellCheck={false} onChange={event => { setEndpoint(event.target.value); dirty(); }} /></label>}
        <label>Model ID<input value={model} placeholder={kind === 'local' ? 'Model name loaded on your local server' : 'Model ID from your provider account'} autoComplete="off" spellCheck={false} onChange={event => { setModel(event.target.value); dirty(); }} /></label>
        <label>{kind === 'local' ? 'API key (optional)' : 'API key'}{kind === 'cloud' && provider !== 'custom' && <a className="link-button" href={PROVIDERS[provider].keyUrl} target="_blank" rel="noreferrer">Get API key</a>}<input type="password" value={apiKey} autoComplete="off" spellCheck={false} placeholder={kind === 'local' ? 'Leave blank if your local server needs no key' : 'Encrypted and saved on this device'} onChange={event => { setKey(event.target.value); dirty(); }} /></label>
      </>}
      {kind === 'cloud' && <p className="notice notice-cloud" role="note">☁️ <strong>Data notice:</strong> Help Me Fill stores no data, but generating suggestions <strong>sends your extracted document text and field metadata to {nameOf(provider)}</strong>. Nothing is sent until you review and approve it on the next step.</p>}
      {provider === 'ollama' && <p className="notice notice-local" role="note">🏠 <strong>Setup required:</strong> install and start <a href={PROVIDERS.ollama.keyUrl} target="_blank" rel="noreferrer">Ollama</a> on this computer, then pull a model (for example <code>ollama pull {PROVIDERS.ollama.defaultModel}</code>). Requests stay on this machine — nothing is sent to the cloud.</p>}
      {provider === 'custom' && <p className="notice notice-local" role="note">🏠 <strong>Setup required:</strong> start your local OpenAI-compatible server (Ollama, LM Studio, llamafile, vLLM…) and enter its <code>/v1/chat/completions</code> address above. Only <code>http://localhost</code> and <code>http://127.0.0.1</code> are allowed. Requests stay on this machine — nothing is sent to the cloud.</p>}
      <div className="button-row"><button type="button" onClick={() => void save()}>{provider === 'builtin' ? 'Enable on-device provider' : kind === 'local' ? 'Enable local provider' : 'Enable provider'}</button>{provider !== 'builtin' && <button type="button" className="secondary" onClick={() => void remove()}>Remove key</button>}</div>
      {provider !== 'builtin' && <button type="button" className="link-button" onClick={() => {
        try {
          const origin = originFor(provider, endpoint);
          void chrome.permissions.remove({ origins: [origin] }).then(() => { onChange(undefined); setStatus('Host permission revoked.'); }, () => setStatus('Permission could not be revoked.'));
        } catch (error) { setStatus(errorMessage(error)); }
      }}>Revoke host permission</button>}
    </fieldset>
    <p className="hint" role="status">{status}</p>
    <p className="hint">API keys are encrypted with AES-GCM and stored only on this device — not a hardware-backed vault, and never sent anywhere except your chosen provider. Cloud provider accounts determine model availability and charges. Local and on-device providers run entirely on this computer. No backend or subscription is included.</p>
  </details>;
}
