import { PROVIDERS, type ProviderSettings, type TransportRequest } from '../registry';
import { UserError } from '../../shared/errors';
import { t } from '../../shared/i18n';
export function geminiRequest(settings: ProviderSettings, system: string, user: string): TransportRequest {
  const model = encodeURIComponent(settings.model.replace(/^models\//, ''));
  return {
    url: `${PROVIDERS.gemini.endpoint}/${model}:generateContent`,
    headers: { 'x-goog-api-key': settings.apiKey },
    body: { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192 },
    },
  };
}
export function geminiText(data: unknown): string {
  const response = data as { candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
  const candidate = response?.candidates?.[0];
  if (candidate?.finishReason !== 'STOP' || !Array.isArray(candidate.content?.parts)) {
    throw new UserError(t('geminiRefused'));
  }
  return candidate.content.parts.filter(part => !part.thought).map(part => part.text ?? '').join('');
}
