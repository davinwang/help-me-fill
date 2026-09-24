import { resolveProvider, type ProviderSettings, type ResolvedProvider, type TransportRequest } from './registry';
import { SYSTEM_PROMPT, makePayload } from './prompts';
import { MappingError, validateMapping } from './validate-mapping';
import { openaiRequest, openaiText } from './transports/openai-compatible';
import { anthropicRequest, anthropicText } from './transports/anthropic';
import { geminiRequest, geminiText } from './transports/gemini';
import { builtinPrompt } from './transports/builtin';
import { detectBuiltin } from './builtin-support';
import { LIMITS, type FieldDescriptor, type MappingPlan } from '../shared/schemas';
import type { DocumentLine } from '../parsers/types';
import { UserError, throwIfAborted } from '../shared/errors';
import { t } from '../shared/i18n';

export type MappingRequest = { lines: DocumentLine[]; fields: FieldDescriptor[]; signal: AbortSignal; onProgress?: (text: string) => void };
export type MappingOutcome = { plan: MappingPlan; calls: number; elapsedMs: number; usage?: Record<string, number> };
export interface AIProvider { map(request: MappingRequest): Promise<MappingOutcome> }

export function validateSettings(settings: ProviderSettings) {
  // The on-device provider is keyless and model-managed by the browser.
  if (settings.provider === 'builtin') return;
  if (!/^[a-zA-Z0-9._:/-]{1,120}$/.test(settings.model)) throw new UserError(t('provBadModel'));
  // Resolving validates a custom endpoint (loopback http only) and yields the kind.
  const resolved = resolveProvider(settings);
  if (settings.apiKey && (/\s/.test(settings.apiKey) || settings.apiKey.length > 1024)) throw new UserError(t('provBadKey'));
  // Cloud providers authenticate with a key; local servers usually need none.
  if (resolved.kind === 'cloud' && !settings.apiKey.trim()) throw new UserError(t('provBadKey'));
}
export function buildRequest(settings: ProviderSettings, system: string, user: string): TransportRequest {
  const transport = resolveProvider(settings).transport;
  if (transport === 'builtin') throw new UserError(t('provBuiltinNoHttp'));
  return transport === 'anthropic' ? anthropicRequest(settings, system, user) : transport === 'gemini' ? geminiRequest(settings, system, user) : openaiRequest(settings, system, user);
}
// A cheap authenticated probe for the settings UI: request the provider's model
// list (GET) to confirm the key, endpoint, and connectivity before saving. It
// never generates tokens and never carries document text. The on-device provider
// has no network, so it is checked via its capability gate instead.
function verifyRequest(settings: ProviderSettings, resolved: ResolvedProvider): { url: string; headers: Record<string, string> } {
  if (resolved.transport === 'anthropic') return { url: resolved.endpoint.replace(/\/messages$/, '/models'), headers: { 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01' } };
  if (resolved.transport === 'gemini') return { url: resolved.endpoint, headers: { 'x-goog-api-key': settings.apiKey } };
  return { url: resolved.endpoint.replace(/\/chat\/completions$/, '/models'), headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {} };
}
export async function verifyProvider(settings: ProviderSettings, fetcher: typeof fetch = fetch): Promise<void> {
  validateSettings(settings);
  const resolved = resolveProvider(settings);
  if (resolved.transport === 'builtin') {
    if (!await detectBuiltin()) throw new UserError(t('verifyBuiltinUnreachable'));
    return;
  }
  const { url, headers } = verifyRequest(settings, resolved);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetcher(url, { method: 'GET', headers, signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
    await response.body?.cancel();
    if (!response.ok) throw new UserError(response.status === 401 || response.status === 403 ? t('verify401')
      : response.status === 400 || response.status === 404 ? t('verify400')
      : response.status === 429 ? t('verify429')
      : t('verifyHttpOther', [response.status]));
  } catch (error) {
    if (error instanceof UserError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw new UserError(t('verifyTimeout'));
    throw new UserError(t('verifyUnreachable'));
  } finally { clearTimeout(timeout); }
}
function extractText(settings: ProviderSettings, value: unknown) {
  const transport = resolveProvider(settings).transport;
  if (transport === 'builtin') throw new UserError(t('provBuiltinNoHttpResponse'));
  return transport === 'anthropic' ? anthropicText(value) : transport === 'gemini' ? geminiText(value) : openaiText(value);
}
function usageNumbers(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const usage = record.usage ?? record.usageMetadata;
  if (!usage || typeof usage !== 'object') return undefined;
  return Object.fromEntries(Object.entries(usage).filter((entry): entry is [string, number] => typeof entry[1] === 'number'));
}
async function readBounded(response: Response): Promise<unknown> {
  if (!response.body) throw new UserError(t('provEmptyResponse'));
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMITS.responseBytes) { await reader.cancel(); throw new UserError(t('provTooBig')); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new UserError(t('provInvalidResponse')); }
}
export function createProvider(settings: ProviderSettings, fetcher: typeof fetch = fetch): AIProvider {
  // Snapshot settings: a UI change must not reroute an already consented request.
  const config = { ...settings };
  return { async map({ lines, fields, signal, onProgress }) {
    validateSettings(config);
    throwIfAborted(signal);
    if (!fields.length || fields.length > LIMITS.fields || lines.reduce((n, line) => n + Array.from(line.text).length, 0) > LIMITS.characters) {
      throw new UserError(t('provInputTooBig'));
    }
    const started = performance.now(), user = JSON.stringify(makePayload(lines, fields));
    if (config.provider === 'builtin') {
      // Same grounding validation and single repair as cloud providers, but no
      // network: the browser's on-device session does the generation.
      let repair = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        throwIfAborted(signal);
        const text = await builtinPrompt(SYSTEM_PROMPT + repair, user, signal, onProgress);
        throwIfAborted(signal);
        try {
          const plan = validateMapping(text, lines, fields);
          return { plan, calls: attempt + 1, elapsedMs: Math.round(performance.now() - started) };
        } catch (error) {
          if (!(error instanceof MappingError) || attempt === 1) throw error;
          repair = `\nYour previous response failed validation: ${error.message} Return a complete corrected JSON object.`;
        }
      }
      throw new UserError(t('provNoSuggestions'));
    }
    let repair = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      throwIfAborted(signal);
      const request = buildRequest(config, SYSTEM_PROMPT + repair, user);
      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);
      try {
        const response = await fetcher(request.url, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...request.headers },
          body: JSON.stringify(request.body), signal: controller.signal,
          credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
        });
        if (!response.ok) {
          await response.body?.cancel();
          const message = response.status === 401 || response.status === 403 ? t('provHttp401')
            : response.status === 429 ? t('provHttp429')
              : response.status === 400 || response.status === 404 ? t('provHttp400') : t('provHttpOther');
          throw new UserError(t('provRequestFailed', [response.status, message]));
        }
        const responseData = await readBounded(response);
        throwIfAborted(signal);
        const text = extractText(config, responseData);
        try {
          const plan = validateMapping(text, lines, fields);
          return { plan, calls: attempt + 1, elapsedMs: Math.round(performance.now() - started), usage: usageNumbers(responseData) };
        } catch (error) {
          if (!(error instanceof MappingError) || attempt === 1) throw error;
          // Retry the original data, not the untrusted output; use only our own diagnostic.
          repair = `\nYour previous response failed validation: ${error.message} Return a complete corrected JSON object.`;
        }
      } catch (error) {
        throwIfAborted(signal);
        if (timedOut) throw new UserError(t('provTimeout'));
        if (error instanceof UserError) throw error;
        throw new UserError(t('provUnreachable'));
      } finally {
        clearTimeout(timeout); signal.removeEventListener('abort', abort);
      }
    }
    throw new UserError(t('provNoSuggestions'));
  } };
}
