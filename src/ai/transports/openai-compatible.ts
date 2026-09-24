import { resolveProvider, type ProviderSettings, type TransportRequest } from '../registry';
import { UserError } from '../../shared/errors';
import { t } from '../../shared/i18n';

export function openaiRequest(settings: ProviderSettings, system: string, user: string): TransportRequest {
  // buildRequest only routes OpenAI-compatible providers here; resolve keeps the
  // transport total on cloud presets, the local preset, and custom endpoints.
  const resolved = resolveProvider(settings);
  if (resolved.transport === 'builtin') throw new UserError(t('provBuiltinNoHttp'));
  return {
    url: resolved.endpoint,
    // Local servers (Ollama, LM Studio) usually need no key; omit the header
    // rather than send an empty bearer token.
    headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {},
    body: { model: settings.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' }, stream: false,
      ...(settings.provider === 'openai' ? { max_completion_tokens: 8192 } : { max_tokens: 8192 }),
    },
  };
}
export function openaiText(data: unknown): string {
  const response = data as { choices?: Array<{ finish_reason?: string; message?: { content?: unknown; refusal?: unknown } }> };
  const choice = response?.choices?.[0];
  if (choice?.finish_reason !== 'stop' || choice.message?.refusal || typeof choice.message?.content !== 'string') {
    throw new UserError(t('openaiRefused'));
  }
  return choice.message.content;
}
