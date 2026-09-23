import { afterEach, describe, expect, it, vi } from 'vitest';
import { builtinPrompt, MAPPING_SCHEMA } from '../../src/ai/transports/builtin';
import { detectBuiltin } from '../../src/ai/builtin-support';
import { createProvider, validateSettings } from '../../src/ai/provider';
import type { FieldDescriptor } from '../../src/shared/schemas';

const signal = () => new AbortController().signal;
const lines = [{ id: 'p1-l1', page: 1, text: 'Name: 陈小明' }];
const fields: FieldDescriptor[] = [{ id: 'f1', type: 'text', label: 'Name', ariaLabel: '', placeholder: '', name: 'name', context: '', required: false, maxLength: 100, pattern: '' }];
const planJson = JSON.stringify({ assignments: [{ fieldId: 'f1', value: '陈小明', evidence: [{ lineId: 'p1-l1', quote: '陈小明' }], reason: 'name' }], unmapped: [] });
const builtinSettings = { provider: 'builtin', model: 'on-device', apiKey: '' } as const;

function fakeApi(state: string, session: Record<string, any> = {}) {
  const sessions: any[] = [];
  const api = {
    availability: async () => state,
    create: async (options: any) => {
      const created: any = {
        options, prompts: [],
        inputTokensLeft: session.inputTokensLeft ?? 8_000,
        async prompt(input: string, opts: any) {
          created.prompts.push([input, opts]);
          if (session.prompt) return session.prompt(input, opts);
          return planJson;
        },
        destroy: () => { created.destroyed = true; },
      };
      if ('countPromptTokens' in session) created.countPromptTokens = session.countPromptTokens;
      else created.countPromptTokens = async (text: string) => Math.ceil(text.length / 4);
      options.monitor?.({ addEventListener: (_type: string, listener: (event: { loaded: number; total: number }) => void) => { created.downloadListener = listener; } });
      sessions.push(created);
      return created;
    },
    sessions,
  };
  (globalThis as any).LanguageModel = api;
  return api;
}
afterEach(() => { delete (globalThis as any).LanguageModel; });

describe('capability gate', () => {
  it('hides the option when the API global is missing or the model is unreachable', async () => {
    expect(await detectBuiltin()).toBeUndefined();
    fakeApi('unavailable');
    expect(await detectBuiltin()).toBeUndefined();
  });
  it('shows the option only for reachable on-device models', async () => {
    fakeApi('downloadable');
    expect(await detectBuiltin()).toBe('downloadable');
    fakeApi('available');
    expect(await detectBuiltin()).toBe('available');
  });
});
describe('on-device transport', () => {
  it('passes the system prompt as initial context and constrains output with the mapping schema', async () => {
    const api = fakeApi('available');
    const text = await builtinPrompt('SYSTEM', '{"documentLines":[]}', signal());
    expect(text).toBe(planJson);
    expect(api.sessions[0].options.initialPrompts).toEqual([{ role: 'system', content: 'SYSTEM' }]);
    expect(api.sessions[0].prompts[0][1].responseConstraint).toBe(MAPPING_SCHEMA);
    expect(api.sessions[0].destroyed).toBe(true);
  });
  it('refuses input that cannot fit the shared context window instead of truncating', async () => {
    fakeApi('available', { inputTokensLeft: 500 });
    await expect(builtinPrompt('SYSTEM', 'x'.repeat(4_000), signal())).rejects.toThrow('nothing was truncated');
  });
  it('falls back to a character budget when token counting is unavailable', async () => {
    fakeApi('available', { countPromptTokens: undefined });
    await expect(builtinPrompt('SYSTEM', 'y'.repeat(12_001), signal())).rejects.toThrow('too large for the on-device model');
    await expect(builtinPrompt('SYSTEM', 'y'.repeat(100), signal())).resolves.toBe(planJson);
  });
  it('reports download progress and destroys the session after a model failure', async () => {
    const api = fakeApi('downloadable', {
      prompt: async () => { api.sessions[0].downloadListener?.({ loaded: 1, total: 4 }); throw new Error('boom'); },
    });
    const progress: string[] = [];
    await expect(builtinPrompt('SYSTEM', 'small', signal(), text => progress.push(text))).rejects.toThrow('on-device model failed');
    expect(progress.join(' ')).toContain('25%');
    expect(api.sessions[0].destroyed).toBe(true);
  });
  it('surfaces cancellation through the shared abort path', async () => {
    fakeApi('available');
    const controller = new AbortController();
    controller.abort();
    await expect(builtinPrompt('SYSTEM', 'small', controller.signal)).rejects.toThrow('Canceled');
  });
});
describe('on-device provider integration', () => {
  it('validates on-device output with the same grounding rules and repairs once', async () => {
    let calls = 0;
    fakeApi('available', {
      prompt: async () => {
        calls++;
        return calls === 1 ? JSON.stringify({ assignments: [{ fieldId: 'f1', value: 'Invented', evidence: [{ lineId: 'p1-l1', quote: 'Invented' }], reason: 'x' }], unmapped: [] }) : planJson;
      },
    });
    const outcome = await createProvider({ ...builtinSettings }, vi.fn() as any).map({ lines, fields, signal: signal() });
    expect(outcome.calls).toBe(2);
    expect(outcome.plan.assignments[0].value).toBe('陈小明');
  });
  it('never touches the network for the on-device provider', async () => {
    fakeApi('available');
    const fetcher = vi.fn();
    await createProvider({ ...builtinSettings }, fetcher as any).map({ lines, fields, signal: signal() });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('accepts keyless settings only for the on-device provider', () => {
    expect(() => validateSettings({ ...builtinSettings })).not.toThrow();
    expect(() => validateSettings({ provider: 'openai', model: 'gpt-4o-mini', apiKey: '' })).toThrow('API key');
  });
});
