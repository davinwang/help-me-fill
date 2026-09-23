import { UserError } from '../shared/errors';

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
  // Local, OpenAI-compatible server. Loopback origins are the only host
  // permission this preset needs; the API key is optional (Ollama ignores it).
  ollama: { name: 'Ollama', origin: 'http://localhost/*', endpoint: 'http://localhost:11434/v1/chat/completions', transport: 'openai', defaultModel: 'llama3.2', keyUrl: 'https://ollama.com/download', kind: 'local' }
} as const;
// Keyless on-device preset. It is offered only after a runtime capability
// check (see builtin-support.ts): no origin, no endpoint, no key, no network.
export const BUILTIN = { id: 'builtin', name: 'On-device (Chrome/Edge built-in)', origin: '', endpoint: '', transport: 'builtin', defaultModel: 'on-device', keyUrl: '', kind: 'builtin' } as const;
// User-supplied local server (Ollama, LM Studio, llamafile, vLLM, ...). The
// endpoint comes from settings; the origin is derived and validated to loopback.
export const CUSTOM = { id: 'custom', name: 'Custom local server', origin: '', endpoint: '', transport: 'openai', defaultModel: '', keyUrl: '', kind: 'local' } as const;

export type ProviderId = keyof typeof PROVIDERS | 'builtin' | 'custom';
export type ProviderSettings = { provider: ProviderId; model: string; apiKey: string; endpoint?: string };
export type TransportRequest = { url: string; headers: Record<string, string>; body: unknown };
export type ResolvedProvider = { id: ProviderId; name: string; origin: string; endpoint: string; transport: Transport; keyUrl: string; kind: ProviderKind };

export function isProvider(value: unknown): value is ProviderId {
  return value === 'builtin' || value === 'custom' || (typeof value === 'string' && Object.hasOwn(PROVIDERS, value));
}

// Derive the loopback match pattern for a custom endpoint and reject anything
// that is not a local http server. Match patterns carry no port, so a single
// http://localhost/* grant covers every local port the user might target.
export function localEndpointOrigin(endpoint: string): string {
  let url: URL;
  try { url = new URL(endpoint.trim()); } catch { throw new UserError('Enter a valid local endpoint URL, e.g. http://localhost:11434/v1/chat/completions.'); }
  if (url.protocol !== 'http:') throw new UserError('The custom endpoint must use http:// on a local address.');
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new UserError('The custom endpoint must be a local address (localhost or 127.0.0.1). Remote custom hosts are not permitted.');
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
