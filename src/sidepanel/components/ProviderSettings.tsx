import { useEffect, useState } from 'react';
import { PROVIDERS, BUILTIN, CUSTOM, isProvider, localEndpointOrigin, type ProviderId, type ProviderKind, type ProviderSettings as Settings } from '../../ai/registry';
import { detectBuiltin, type BuiltinState } from '../../ai/builtin-support';
import { validateSettings, verifyProvider } from '../../ai/provider';
import { errorMessage, UserError } from '../../shared/errors';
import { t } from '../../shared/i18n';
import { openSecret, sealSecret } from '../../shared/secret-box';
import { Rich } from './Rich';

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
// Kind glyph carried by every option. The dropdown is already grouped by kind,
// but the collapsed select shows only the selected option, so a leading icon
// keeps the cloud/local/on-device distinction visible without a separate badge.
const KIND_ICON: Record<ProviderKind, string> = { cloud: '☁️', local: '🏠', builtin: '📱' };

type Props = { disabled: boolean; onChange: (settings?: Settings) => void };
export function ProviderSettings({ disabled, onChange }: Props) {
  const [provider, setProvider] = useState<ProviderId>('openai');
  const [model, setModel] = useState<string>(PROVIDERS.openai.defaultModel);
  const [apiKey, setKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [builtin, setBuiltin] = useState<BuiltinState | undefined>(undefined);
  const [savedKeys, setSavedKeys] = useState<ReadonlySet<ProviderId>>(() => new Set());
  const [status, setStatus] = useState(() => t('psStatusDefault'));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      // The on-device option appears only when this browser/device passes the check.
      const support = await detectBuiltin();
      if (!alive) return;
      setBuiltin(support);
      // One read serves both the saved-key markers and the restore below.
      const all = await chrome.storage.local.get(null);
      if (!alive) return;
      setSavedKeys(new Set(Object.keys(all).filter(name => name.startsWith('key:') && typeof all[name] === 'string' && all[name] !== '').map(name => name.slice(4) as ProviderId)));
      const preferences = all.preferences as { provider?: unknown; model?: unknown; endpoint?: unknown } | undefined;
      if (!preferences || !isProvider(preferences.provider) || typeof preferences.model !== 'string') return;
      const id = preferences.provider;
      if (id === 'builtin') {
        if (!support) { setStatus(t('psBuiltinUnavailableSaved')); return; }
        setProvider(id); setModel(BUILTIN.defaultModel);
        onChange({ provider: id, model: BUILTIN.defaultModel, apiKey: '' });
        setStatus(t('psBuiltinRestored'));
        return;
      }
      const savedEndpoint = id === 'custom' && typeof preferences.endpoint === 'string' ? preferences.endpoint : '';
      if (id === 'custom' && !savedEndpoint) { setStatus(t('psCustomEndpointMissing')); return; }
      // The key is stored sealed (AES-GCM) in local storage; open it in memory only.
      const sealed = typeof all[`key:${id}`] === 'string' ? all[`key:${id}`] as string : '';
      const key = sealed ? await openSecret(sealed) : '';
      if (!alive) return;
      setProvider(id); setModel(preferences.model); setKey(key); if (id === 'custom') setEndpoint(savedEndpoint);
      // Local servers may have no key; the granted host permission is the gate.
      if (originFor(id, savedEndpoint) && await chrome.permissions.contains({ origins: [originFor(id, savedEndpoint)] })) {
        if (!alive) return;
        onChange({ provider: id, model: preferences.model, apiKey: key, ...(id === 'custom' ? { endpoint: savedEndpoint } : {}) });
        setStatus(kindOf(id) === 'local' ? t('psLocalRestored') : t('psKeyRestored'));
      }
    })().catch(() => { if (alive) setStatus(t('psRestoreFailed')); });
    return () => { alive = false; };
  }, [onChange]);
  const dirty = () => { onChange(undefined); setStatus(t('psUnsaved')); };
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
      if (provider !== 'builtin') {
        // This call must remain directly inside the user gesture, before any await.
        const permission = chrome.permissions.request({ origins: [originFor(provider, settings.endpoint)] });
        if (!await permission) throw new UserError(t('psPermissionDeclined'));
      }
      // Verify the environment before anything is stored: a live model-list probe
      // for network providers, the capability gate for on-device. Failure blocks the save.
      setStatus(provider === 'builtin' ? t('psCheckingBuiltin') : t('psVerifying'));
      await verifyProvider(settings);
      if (provider !== 'builtin') {
        // Seal the key with AES-GCM before it ever reaches persistent storage.
        await chrome.storage.local.set({ [`key:${provider}`]: await sealSecret(settings.apiKey) });
      }
      await chrome.storage.local.set({ preferences: { provider, model: settings.model, ...(provider === 'custom' ? { endpoint: settings.endpoint } : {}) } });
      setSavedKeys(previous => { const next = new Set(previous); if (settings.apiKey) next.add(provider); else next.delete(provider); return next; });
      onChange(settings);
      setStatus(provider === 'builtin'
        ? t('psBuiltinVerified')
        : kindOf(provider) === 'local'
          ? t('psLocalVerified')
          : t('psCloudVerified'));
    } catch (error) { setStatus(errorMessage(error)); }
    finally { setSaving(false); }
  }
  async function remove() {
    try {
      await chrome.storage.local.remove(`key:${provider}`);
      setSavedKeys(previous => { const next = new Set(previous); next.delete(provider); return next; });
      setKey(''); onChange(undefined); setStatus(t('psKeyRemoved'));
    } catch { setStatus(t('psKeyRemoveFailed')); }
  }
  const kind = kindOf(provider);
  // Group the dropdown by kind; each option leads with its kind glyph, so the
  // collapsed select still says where extracted text would be sent. A trailing
  // key glyph marks providers that already have a saved key.
  const cloudEntries = Object.entries(PROVIDERS).filter(([, info]) => info.kind === 'cloud');
  const localEntries = Object.entries(PROVIDERS).filter(([, info]) => info.kind === 'local');
  const savedMark = (id: string) => savedKeys.has(id as ProviderId) ? '  🔑' : '';
  const optionLabel = (name: string, icon: ProviderKind, id: string) => `${KIND_ICON[icon]} ${name}${savedMark(id)}`;
  return <details className="card settings" open>
    <summary>{t('psSummary')} <span className="subtle">{t('psKinds')}{builtin ? ` · ${t('psBuiltinDetected')}` : ''}</span></summary>
    <fieldset disabled={disabled || saving}>
      <label>{t('psProvider')}
        <select value={provider} onChange={event => { const id = event.target.value as ProviderId; setProvider(id); setModel(defaultModelFor(id)); setKey(''); dirty(); }}>
          <optgroup label={t('kindCloud')}>{cloudEntries.map(([id, info]) => <option key={id} value={id}>{optionLabel(info.name, info.kind, id)}</option>)}</optgroup>
          <optgroup label={t('kindLocal')}>
            {localEntries.map(([id, info]) => <option key={id} value={id}>{optionLabel(info.name, info.kind, id)}</option>)}
            <option value="custom">{optionLabel(CUSTOM.name, CUSTOM.kind, 'custom')}</option>
          </optgroup>
          {builtin && <optgroup label={t('kindBuiltin')}><option value="builtin">{optionLabel(BUILTIN.name, BUILTIN.kind, 'builtin')}</option></optgroup>}
        </select>
        {savedKeys.has(provider) && <span className="badge badge-saved" title={t('psKeySavedTitle')}>🔑 {t('psKeySaved')}</span>}
      </label>
      {provider === 'builtin' ? <p className="hint">{builtin === 'available'
        ? t('psBuiltinReady')
        : t('psBuiltinDownload')}</p> : <>
        {provider === 'custom' && <label>{t('psEndpointUrl')}<input value={endpoint} placeholder="http://localhost:11434/v1/chat/completions" autoComplete="off" spellCheck={false} onChange={event => { setEndpoint(event.target.value); dirty(); }} /></label>}
        <label>{t('psModelId')}<input value={model} placeholder={kind === 'local' ? t('psModelPlaceholderLocal') : t('psModelPlaceholderCloud')} autoComplete="off" spellCheck={false} onChange={event => { setModel(event.target.value); dirty(); }} /></label>
        <label>{kind === 'local' ? t('psApiKeyOptional') : t('psApiKey')}{kind === 'cloud' && provider !== 'custom' && <a className="link-button" href={PROVIDERS[provider].keyUrl} target="_blank" rel="noreferrer">{t('psGetApiKey')}</a>}<input type="password" value={apiKey} autoComplete="off" spellCheck={false} placeholder={kind === 'local' ? t('psKeyPlaceholderLocal') : t('psKeyPlaceholderCloud')} onChange={event => { setKey(event.target.value); dirty(); }} /></label>
      </>}
      {kind === 'cloud' && <p className="notice notice-cloud" role="note"><Rich message={t('psNoticeCloud', [nameOf(provider)])} /></p>}
      {(provider === 'ollama' || provider === 'lmstudio') && <p className="notice notice-local" role="note"><Rich message={t('psNoticeLocal', [PROVIDERS[provider].name, PROVIDERS[provider].keyUrl, PROVIDERS[provider].defaultModel])} /></p>}
      {provider === 'custom' && <p className="notice notice-local" role="note"><Rich message={t('psNoticeCustom')} /></p>}
      <div className="button-row"><button type="button" onClick={() => void save()}>{provider === 'builtin' ? t('psEnableBuiltinModel') : kind === 'local' ? t('psSaveVerify') : t('psSaveVerifyKey')}</button>{provider !== 'builtin' && <button type="button" className="secondary" onClick={() => void remove()}>{t('psRemoveKey')}</button>}</div>
      {provider !== 'builtin' && <button type="button" className="link-button" onClick={() => {
        try {
          const origin = originFor(provider, endpoint);
          void chrome.permissions.remove({ origins: [origin] }).then(() => { onChange(undefined); setStatus(t('psPermissionRevoked')); }, () => setStatus(t('psPermissionRevokeFailed')));
        } catch (error) { setStatus(errorMessage(error)); }
      }}>{t('psRevokePermission')}</button>}
    </fieldset>
    <p className="hint" role="status">{status}</p>
    <p className="hint">{t('psKeyHint')}</p>
  </details>;
}
