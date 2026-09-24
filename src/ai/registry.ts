import { UserError } from '../shared/errors';
import { t } from '../shared/i18n';

export type ProviderKind = 'cloud' | 'local' | 'builtin';
export type Transport = 'openai' | 'anthropic' | 'gemini' | 'builtin';

export const PROVIDERS = {
  openai: { name: 'OpenAI', origin: 'https://api.openai.com/*', endpoint: 'https://api.openai.com/v1/chat/completions', transport: 'openai', defaultModel: 'gpt-4o-mini', keyUrl: 'https://platform.openai.com/api-keys', kind: 'cloud' },
  deepseek: { name: 'DeepSeek', origin: 'https://api.deepseek.com/*', endpoint: 'https://api.deepseek.com/chat/completions', transport: 'openai', defaultModel: 'deepseek-flash', keyUrl: 'https://platform.deepseek.com/api_keys', kind: 'cloud' },
  anthropic: { name: 'Anthropic', origin: 'https://api.anthropic.com/*', endpoint: 'https://api.anthropic.com/v1/messages', transport: 'anthropic', defaultModel: 'claude-haiku-4-5', keyUrl: 'https://console.anthropic.com/settings/keys', kind: 'cloud' },
  gemini: { name: 'Google Gemini', origin: 'https://generativelanguage.googleapis.com/*', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', transport: 'gemini', defaultModel: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey', kind: 'cloud' },
  zhipu: { name: '智谱', origin: 'https://open.bigmodel.cn/*', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', transport: 'openai', defaultModel: 'glm-5.3-flash', keyUrl: 'https://open.bigmodel.cn/apikey/platform', kind: 'cloud' },
  zai: { name: 'Z.ai', origin: 'https://open.bigmodel.cn/*', endpoint: 'https://api.z.ai/api/paas/v4/chat/completions', transport: 'openai', defaultModel: 'glm-5.3-flash', keyUrl: 'https://z.ai/manage-apikey/apikey-list', kind: 'cloud' },
  openrouter: { name: 'OpenRouter', origin: 'https://openrouter.ai/*', endpoint: 'https://openrouter.ai/api/v1/chat/completions', transport: 'openai', defaultModel: 'google/gemini-2.5-flash', keyUrl: 'https://openrouter.ai/settings/keys', kind: 'cloud' },
  // Local, OpenAI-compatible servers. Loopback origins are the only host
  // permission these presets need; the API key is optional (both ignore it by default).
  ollama: { name: 'Ollama', origin: 'http://localhost/*', endpoint: 'http://localhost:11434/v1/chat/completions', transport: 'openai', defaultModel: 'llama3.2', keyUrl: 'https://ollama.com/download', kind: 'local' },
  lmstudio: { name: 'LM Studio', origin: 'http://localhost/*', endpoint: 'http://localhost:1234/v1/chat/completions', transport: 'openai', defaultModel: 'local-model', keyUrl: 'https://lmstudio.ai/docs', kind: 'local' }
} as const;
// Keyless on-device preset. It is offered only after a runtime capability
// check (see builtin-support.ts): no origin, no endpoint, no key, no network.
export const BUILTIN = { id: 'builtin', name: 'On-device (Chrome/Edge built-in)', origin: '', endpoint: '', transport: 'builtin', defaultModel: 'on-device', keyUrl: '', kind: 'builtin' } as const;
// User-supplied local server (Ollama, LM Studio, llamafile, vLLM, ...). The
// endpoint comes from settings; the origin is derived and validated to loopback
// or an RFC1918 private-network address.
export const CUSTOM = { id: 'custom', name: 'Custom local server', origin: '', endpoint: '', transport: 'openai', defaultModel: '', keyUrl: '', kind: 'local' } as const;

export type ProviderId = keyof typeof PROVIDERS | 'builtin' | 'custom';
export type ProviderSettings = { provider: ProviderId; model: string; apiKey: string; endpoint?: string };
export type TransportRequest = { url: string; headers: Record<string, string>; body: unknown };
export type ResolvedProvider = { id: ProviderId; name: string; origin: string; endpoint: string; transport: Transport; keyUrl: string; kind: ProviderKind };

export function isProvider(value: unknown): value is ProviderId {
  return value === 'builtin' || value === 'custom' || (typeof value === 'string' && Object.hasOwn(PROVIDERS, value));
}

// True for localhost, IPv4 loopback (127.0.0.0/8), and the RFC1918 private
// ranges 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16. Public hosts are refused so
// the broad optional http://*/* permission can never be pointed at the internet.
function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost') return true;
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!parts) return false;
  const octets = parts.slice(1).map(Number);
  if (octets.some(octet => octet > 255)) return false;
  const [a, b] = octets;
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// Derive the match pattern for a custom endpoint and reject anything that is not
// a local or private-network http server. Match patterns carry no port, so one
// http://<host>/* grant covers every port the user might target on that host.
export function localEndpointOrigin(endpoint: string): string {
  let url: URL;
  try { url = new URL(endpoint.trim()); } catch { throw new UserError(t('regBadEndpoint')); }
  if (url.protocol !== 'http:') throw new UserError(t('regNeedHttp'));
  if (!isPrivateHost(url.hostname)) throw new UserError(t('regNeedLocal'));
  return `${url.protocol}//${url.hostname}/*`;
}

// Single source of truth for a provider's network identity. Cloud/local presets
// resolve from the registry; the custom preset resolves from the user endpoint.
export function resolveProvider(settings: ProviderSettings): ResolvedProvider {
  if (settings.provider === 'builtin') return { ...BUILTIN };
  if (settings.provider === 'custom') {
    const endpoint = (settings.endpoint ?? '').trim();
    return { ...CUSTOM, endpoint, origin: localEndpointOrigin(endpoint) };
  }
  const entry = PROVIDERS[settings.provider];
  return { id: settings.provider, name: entry.name, origin: entry.origin, endpoint: entry.endpoint, transport: entry.transport, keyUrl: entry.keyUrl, kind: entry.kind };
}
