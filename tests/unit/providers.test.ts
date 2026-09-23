import { describe, it, expect, vi, afterEach } from 'vitest';
import { createProvider, buildRequest, validateSettings } from '../../src/ai/provider';
import { PROVIDERS, resolveProvider, localEndpointOrigin, type ProviderId, type ProviderSettings } from '../../src/ai/registry';
import type { FieldDescriptor } from '../../src/shared/schemas';
const field: FieldDescriptor = { id: 'f1', type: 'text', label: 'Name', ariaLabel: '', placeholder: '', name: 'name', context: '', required: false, maxLength: -1, pattern: '' };
const lines = [{ id: 'p1-l1', page: 1, text: 'Name: Alice' }];
const plan = { assignments: [{ fieldId: 'f1', value: 'Alice', evidence: [{ lineId: 'p1-l1', quote: 'Alice' }], reason: 'Name' }], unmapped: [] };
const settings = (provider: ProviderId = 'openai') => ({ provider, model: 'test-model', apiKey: 'synthetic-test-key' });
const payload = () => ({ lines, fields: [field], signal: new AbortController().signal });
const envelope = (provider: ProviderId, content = JSON.stringify(plan)) => provider === 'anthropic' ? { stop_reason: 'end_turn', content: [{ type: 'text', text: content }] }
  : provider === 'gemini' ? { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: content }] } }] }
    : { choices: [{ finish_reason: 'stop', message: { content } }] };
afterEach(() => vi.useRealTimers());
describe.each(Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[])('%s transport', provider => {
  it('uses only its fixed host and header credentials', () => {
    const request = buildRequest(settings(provider), 'system', 'user');
    expect(request.url).toContain(new URL(PROVIDERS[provider].endpoint).origin);
    expect(request.url).not.toContain('synthetic-test-key');
    expect(JSON.stringify(request.headers)).toContain('synthetic-test-key');
    expect(JSON.stringify(request.body)).not.toContain('synthetic-test-key');
  });
  it('normalizes and validates a mocked provider response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope(provider)));
    const output = await createProvider(settings(provider), fetcher).map(payload());
    expect(output.plan).toEqual(plan); expect(output.calls).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' });
  });
});
describe('registry defaults and key pages', () => {
  it('ships an editable flash-class default model and a console key page per provider', () => {
    for (const info of Object.values(PROVIDERS)) {
      expect(info.defaultModel).toBeTruthy();
      expect(info.keyUrl).toMatch(/^https:\/\//);
      expect(info.keyUrl).not.toBe(info.endpoint);
    }
    expect(PROVIDERS.deepseek.defaultModel).toBe('deepseek-flash');
    expect(PROVIDERS.zhipu.defaultModel).toBe('glm-5.3-flash');
  });
  it('uses provider-appropriate token limits on OpenAI-compatible transports', () => {
    expect(JSON.stringify(buildRequest(settings('openai'), 's', 'u'))).toContain('max_completion_tokens');
    for (const [id, info] of Object.entries(PROVIDERS)) {
      if (info.transport !== 'openai' || id === 'openai') continue;
      const body = JSON.stringify(buildRequest(settings(id as ProviderId), 's', 'u'));
      expect(body).toContain('"max_tokens":8192'); expect(body).not.toContain('max_completion_tokens');
    }
  });
});
describe('local and custom providers', () => {
  const custom = (endpoint: string, apiKey = ''): ProviderSettings => ({ provider: 'custom', model: 'local-model', apiKey, endpoint });
  it('marks Ollama as local and keeps its API key optional', () => {
    expect(PROVIDERS.ollama.kind).toBe('local');
    expect(() => validateSettings({ provider: 'ollama', model: 'llama3.2', apiKey: '' })).not.toThrow();
    // A local request omits the Authorization header entirely when no key is set.
    expect(buildRequest({ provider: 'ollama', model: 'llama3.2', apiKey: '' }, 's', 'u').headers).toEqual({});
  });
  it('still requires an API key for cloud providers', () => {
    expect(() => validateSettings({ provider: 'openai', model: 'gpt-4o-mini', apiKey: '' })).toThrow('API key');
  });
  it('resolves a custom endpoint to its loopback origin and uses it verbatim', () => {
    const resolved = resolveProvider(custom('http://localhost:1234/v1/chat/completions'));
    expect(resolved.kind).toBe('local'); expect(resolved.origin).toBe('http://localhost/*');
    expect(buildRequest(custom('http://127.0.0.1:8080/v1/chat/completions'), 's', 'u').url).toBe('http://127.0.0.1:8080/v1/chat/completions');
    expect(() => validateSettings(custom('http://localhost:1234/v1/chat/completions'))).not.toThrow();
  });
  it('rejects custom endpoints that are not local http servers', () => {
    expect(() => localEndpointOrigin('https://api.openai.com/v1')).toThrow('local address');
    expect(() => localEndpointOrigin('https://localhost:1234/v1')).toThrow('http://');
    expect(() => localEndpointOrigin('not a url')).toThrow('valid local endpoint');
    expect(() => validateSettings(custom('https://evil.example.com/v1'))).toThrow();
  });
  it('normalizes and validates a mocked local server response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope('ollama')));
    const output = await createProvider({ provider: 'ollama', model: 'llama3.2', apiKey: '' }, fetcher).map(payload());
    expect(output.plan).toEqual(plan); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(PROVIDERS.ollama.endpoint);
  });
});
describe('request safety and failures', () => {
  it('does nothing before map is explicitly called', () => { const fetcher = vi.fn(); createProvider(settings(), fetcher); expect(fetcher).not.toHaveBeenCalled(); });
  it('repairs schema once, without sending the untrusted model output back', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(envelope('openai', 'ATTACKER_OUTPUT'))).mockResolvedValueOnce(Response.json(envelope('openai')));
    const result = await createProvider(settings(), fetcher).map(payload());
    expect(result.calls).toBe(2); expect(fetcher.mock.calls[1][1]?.body).not.toContain('ATTACKER_OUTPUT');
  });
  it('stops after two invalid JSON responses', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(envelope('openai', 'bad')));
    await expect(createProvider(settings(), fetcher).map(payload())).rejects.toThrow('valid JSON'); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([400, 401, 403, 404, 429, 500])('does not retry or leak error bodies on HTTP %i', async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('SECRET_PROVIDER_BODY', { status }));
    await expect(createProvider(settings(), fetcher).map(payload())).rejects.toThrow(`(${status})`);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not retry network failures', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('PRIVATE_ERROR'));
    await expect(createProvider(settings(), fetcher).map(payload())).rejects.toThrow('Could not reach'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not start a canceled request', async () => {
    const abort = new AbortController(); abort.abort(); const fetcher = vi.fn();
    await expect(createProvider(settings(), fetcher).map({ ...payload(), signal: abort.signal })).rejects.toThrow('Canceled'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('times out without automatic retry', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
    const result = expect(createProvider(settings(), fetcher).map(payload())).rejects.toThrow('60 seconds');
    await vi.advanceTimersByTimeAsync(60_001); await result; expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects refusal or truncated responses without schema repair', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }));
    await expect(createProvider(settings(), fetcher).map(payload())).rejects.toThrow('truncated'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects oversized responses', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(270_000)));
    await expect(createProvider(settings(), fetcher).map(payload())).rejects.toThrow('256 KiB'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
