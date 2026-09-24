import { UserError, throwIfAborted } from '../../shared/errors';
import { t } from '../../shared/i18n';
import { builtinApi, BUILTIN_TEXT_IO, type BuiltinSession } from '../builtin-support';

// Same contract as the cloud transports, expressed as a JSON Schema so the
// on-device model is constrained at generation time; validateMapping still
// grounds every quote afterwards.
export const MAPPING_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['assignments', 'unmapped'],
  properties: {
    assignments: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['fieldId', 'value', 'evidence', 'reason'],
        properties: {
          fieldId: { type: 'string', description: 'One of the supplied opaque field IDs.' },
          value: { type: 'string', description: 'Value copied from the document evidence.' },
          evidence: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false, required: ['lineId', 'quote'],
              properties: { lineId: { type: 'string' }, quote: { type: 'string', description: 'Exact substring of the cited line.' } },
            },
          },
          reason: { type: 'string' },
        },
      },
    },
    unmapped: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['fieldId', 'reason'],
        properties: { fieldId: { type: 'string' }, reason: { type: 'string' } },
      },
    },
  },
};
// The on-device context window is shared between input and output and overflows
// silently, so we reserve output space and refuse oversized input explicitly.
const OUTPUT_RESERVE = 2_048;
const FALLBACK_CHARACTER_LIMIT = 12_000;
const BUILTIN_TIMEOUT = 120_000;

export async function builtinPrompt(system: string, user: string, signal: AbortSignal, onProgress?: (text: string) => void): Promise<string> {
  const api = builtinApi();
  if (!api) throw new UserError(t('builtinNoApi'));
  const state = await api.availability(BUILTIN_TEXT_IO);
  if (state === 'unavailable') throw new UserError(t('builtinUnavailable'));
  throwIfAborted(signal);
  let session: BuiltinSession | undefined;
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, BUILTIN_TIMEOUT);
  try {
    session = await api.create({
      expectedInputs: BUILTIN_TEXT_IO.expectedInputs,
      expectedOutputs: BUILTIN_TEXT_IO.expectedOutputs,
      initialPrompts: [{ role: 'system', content: system }],
      signal: controller.signal,
      monitor: monitor => monitor.addEventListener('downloadprogress', event => {
        if (!signal.aborted && event.total) onProgress?.(t('builtinDownloading', [Math.round((event.loaded / event.total) * 100)]));
      }),
    });
    throwIfAborted(signal);
    if (typeof session.countPromptTokens === 'function') {
      const tokens = await session.countPromptTokens(user, { responseConstraint: MAPPING_SCHEMA });
      if (tokens + OUTPUT_RESERVE > session.inputTokensLeft) {
        throw new UserError(t('builtinTokensExceeded', [tokens, session.inputTokensLeft]));
      }
    } else if (user.length > FALLBACK_CHARACTER_LIMIT) {
      throw new UserError(t('builtinTooLarge'));
    }
    onProgress?.(t('builtinWaiting'));
    const text = await session.prompt(user, { responseConstraint: MAPPING_SCHEMA, signal: controller.signal });
    if (typeof text !== 'string' || !text.trim()) throw new UserError(t('builtinEmpty'));
    return text;
  } catch (error) {
    throwIfAborted(signal);
    if (timedOut) throw new UserError(t('builtinTimeout'));
    if (error instanceof UserError) throw error;
    throw new UserError(t('builtinFailed', [error instanceof Error ? error.message : 'unknown error']));
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
    session?.destroy();
  }
}
