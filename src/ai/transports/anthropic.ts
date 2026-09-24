import { PROVIDERS, type ProviderSettings, type TransportRequest } from '../registry';
import { UserError } from '../../shared/errors';
import { t } from '../../shared/i18n';
export function anthropicRequest(settings: ProviderSettings, system: string, user: string): TransportRequest {
  return {
    url: PROVIDERS.anthropic.endpoint,
    headers: { 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: { model: settings.model, system, max_tokens: 8192, messages: [{ role: 'user', content: user }], stream: false },
  };
}
export function anthropicText(data: unknown): string {
  const response = data as { stop_reason?: string; content?: Array<{ type: string; text?: string }> };
  if (response?.stop_reason !== 'end_turn' || !Array.isArray(response.content) || response.content.some(block => block.type !== 'text')) {
    throw new UserError(t('anthropicRefused'));
  }
  return response.content.map(block => block.text ?? '').join('');
}
