export const PROVIDERS = {
  openai: { name: 'OpenAI', origin: 'https://api.openai.com/*', endpoint: 'https://api.openai.com/v1/chat/completions', transport: 'openai', defaultModel: 'gpt-4o-mini', keyUrl: 'https://platform.openai.com/api-keys' },
  deepseek: { name: 'DeepSeek', origin: 'https://api.deepseek.com/*', endpoint: 'https://api.deepseek.com/chat/completions', transport: 'openai', defaultModel: 'deepseek-flash', keyUrl: 'https://platform.deepseek.com/api_keys' },
  anthropic: { name: 'Anthropic', origin: 'https://api.anthropic.com/*', endpoint: 'https://api.anthropic.com/v1/messages', transport: 'anthropic', defaultModel: 'claude-haiku-4-5', keyUrl: 'https://console.anthropic.com/settings/keys' },
  gemini: { name: 'Google Gemini', origin: 'https://generativelanguage.googleapis.com/*', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', transport: 'gemini', defaultModel: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey' },
  zhipu: { name: '智谱', origin: 'https://open.bigmodel.cn/*', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', transport: 'openai', defaultModel: 'glm-5.3-flash', keyUrl: 'https://open.bigmodel.cn/apikey/platform' },
  zai: { name: 'Z.ai', origin: 'https://open.bigmodel.cn/*', endpoint: 'https://api.z.ai/api/paas/v4/chat/completions', transport: 'openai', defaultModel: 'glm-5.3-flash', keyUrl: 'https://z.ai/manage-apikey/apikey-list' },
  openrouter: { name: 'OpenRouter', origin: 'https://openrouter.ai/*', endpoint: 'https://openrouter.ai/api/v1/chat/completions', transport: 'openai', defaultModel: 'google/gemini-2.5-flash', keyUrl: 'https://openrouter.ai/settings/keys' }
} as const;
// Keyless on-device preset. It is offered only after a runtime capability
// check (see builtin-support.ts): no origin, no endpoint, no key, no network.
export const BUILTIN = { id: 'builtin', name: 'On-device (Chrome/Edge built-in)', origin: '', endpoint: '', transport: 'builtin', defaultModel: 'on-device', keyUrl: '' } as const;
export type ProviderId = keyof typeof PROVIDERS | 'builtin';
export type ProviderSettings = { provider: ProviderId; model: string; apiKey: string };
export type TransportRequest = { url: string; headers: Record<string, string>; body: unknown };
export function isProvider(value: unknown): value is ProviderId {
  return value === 'builtin' || (typeof value === 'string' && Object.hasOwn(PROVIDERS, value));
}
