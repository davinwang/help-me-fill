import { resolveProvider, type ProviderSettings, type TransportRequest } from './registry';
import { SYSTEM_PROMPT, makePayload } from './prompts';
import { MappingError, validateMapping } from './validate-mapping';
import { openaiRequest, openaiText } from './transports/openai-compatible';
import { anthropicRequest, anthropicText } from './transports/anthropic';
import { geminiRequest, geminiText } from './transports/gemini';
import { builtinPrompt } from './transports/builtin';
import { LIMITS, type FieldDescriptor, type MappingPlan } from '../shared/schemas';
import type { DocumentLine } from '../parsers/types';
import { UserError, throwIfAborted } from '../shared/errors';

export type MappingRequest = { lines: DocumentLine[]; fields: FieldDescriptor[]; signal: AbortSignal; onProgress?: (text: string) => void };
export type MappingOutcome = { plan: MappingPlan; calls: number; elapsedMs: number; usage?: Record<string, number> };
export interface AIProvider { map(request: MappingRequest): Promise<MappingOutcome> }

export function validateSettings(settings: ProviderSettings) {
  // The on-device provider is keyless and model-managed by the browser.
  if (settings.provider === 'builtin') return;
  if (!/^[a-zA-Z0-9._:/-]{1,120}$/.test(settings.model)) throw new UserError('Enter a valid text-model ID from your provider.');
  // Resolving validates a custom endpoint (loopback http only) and yields the kind.
  const resolved = resolveProvider(settings);
  if (settings.apiKey && (/\s/.test(settings.apiKey) || settings.apiKey.length > 1024)) throw new UserError('Enter a valid API key without spaces.');
  // Cloud providers authenticate with a key; local servers usually need none.
  if (resolved.kind === 'cloud' && !settings.apiKey.trim()) throw new UserError('Enter a valid API key without spaces.');
}
export function buildRequest(settings: ProviderSettings, system: string, user: string): TransportRequest {
  const transport = resolveProvider(settings).transport;
  if (transport === 'builtin') throw new UserError('The on-device provider does not use HTTP requests.');
  return transport === 'anthropic' ? anthropicRequest(settings, system, user) : transport === 'gemini' ? geminiRequest(settings, system, user) : openaiRequest(settings, system, user);
}
function extractText(settings: ProviderSettings, value: unknown) {
  const transport = resolveProvider(settings).transport;
  if (transport === 'builtin') throw new UserError('The on-device provider does not use HTTP responses.');
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
  if (!response.body) throw new UserError('The provider returned an empty response.');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMITS.responseBytes) { await reader.cancel(); throw new UserError('The provider response exceeded 256 KiB. Choose a shorter document.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new UserError('The provider returned an invalid API response.'); }
}
export function createProvider(settings: ProviderSettings, fetcher: typeof fetch = fetch): AIProvider {
  // Snapshot settings: a UI change must not reroute an already consented request.
  const config = { ...settings };
  return { async map({ lines, fields, signal, onProgress }) {
    validateSettings(config);
    throwIfAborted(signal);
    if (!fields.length || fields.length > LIMITS.fields || lines.reduce((n, line) => n + Array.from(line.text).length, 0) > LIMITS.characters) {
      throw new UserError('The mapping input is empty or exceeds the prototype limits.');
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
      throw new UserError('No valid suggestions were returned.');
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
          const message = response.status === 401 || response.status === 403 ? 'Check your API key, account access, and browser-access policy.'
            : response.status === 429 ? 'Rate limit or quota reached. Wait or check your provider account before retrying.'
              : response.status === 400 || response.status === 404 ? 'Check the model ID and its support for this provider API and JSON output.' : 'The provider is unavailable. Retry explicitly later.';
          throw new UserError(`Provider request failed (${response.status}). ${message}`);
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
        if (timedOut) throw new UserError('The provider took longer than 60 seconds. Retry explicitly; no automatic retry was made.');
        if (error instanceof UserError) throw error;
        throw new UserError('Could not reach the selected provider. Check network access and API host permission.');
      } finally {
        clearTimeout(timeout); signal.removeEventListener('abort', abort);
      }
    }
    throw new UserError('No valid suggestions were returned.');
  } };
}
