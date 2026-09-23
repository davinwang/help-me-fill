import { PROVIDERS, type ProviderSettings, type TransportRequest } from '../registry';
import { UserError } from '../../shared/errors';

export function openaiRequest(settings: ProviderSettings, system: string, user: string): TransportRequest {
  // buildRequest only routes hosted providers here; keep the transport total on its input.
  if (settings.provider === 'builtin') throw new UserError('The on-device provider does not use HTTP requests.');
  return {
    url: PROVIDERS[settings.provider].endpoint,
    headers: { Authorization: `Bearer ${settings.apiKey}` },
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
    throw new UserError('The provider refused or truncated the response, or this model is incompatible. Try a supported text model or a shorter document.');
  }
  return choice.message.content;
}
