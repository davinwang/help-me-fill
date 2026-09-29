import { describe, it, expect, vi } from 'vitest';
import { loadPreset, presetSettings, PRESET_FILE, type PresetConfig } from '../../src/ai/preset';
import { PRESET, isProvider, resolveProvider, defaultAutoSend, localEndpointOrigin } from '../../src/ai/registry';
import { buildRequest, validateSettings } from '../../src/ai/provider';

// The bundled preset is a private-LAN OpenAI-compatible endpoint, mirroring the
// shape scripts/build.mjs copies into dist/ from the git-ignored preset-llm.json.
const bundled: PresetConfig = { name: '预设', kind: 'preset', endpoint: 'http://10.75.128.152:3000/v1/chat/completions', model: 'qwen3-235b-awq', apiKey: 'synthetic-preset-key' };
const resolveUrl = () => `chrome-extension://test/${PRESET_FILE}`;
const jsonFetcher = (body: unknown, ok = true) => vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status: ok ? 200 : 404 }));

describe('loadPreset', () => {
  it('reads and returns a well-formed bundled preset from the extension origin', async () => {
    const fetcher = jsonFetcher(bundled);
    await expect(loadPreset(fetcher, resolveUrl)).resolves.toEqual(bundled);
    expect(fetcher.mock.calls[0][0]).toBe(`chrome-extension://test/${PRESET_FILE}`);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: 'no-store', credentials: 'omit' });
  });
  it('returns undefined when the preset file is absent', async () => {
    await expect(loadPreset(jsonFetcher({}, false), resolveUrl)).resolves.toBeUndefined();
  });
  it('returns undefined for malformed JSON instead of throwing', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('not json', { status: 200 }));
    await expect(loadPreset(fetcher, resolveUrl)).resolves.toBeUndefined();
  });
  it('rejects a preset with unknown, missing, or mismatched fields (strict schema)', async () => {
    await expect(loadPreset(jsonFetcher({ ...bundled, extra: 'nope' }), resolveUrl)).resolves.toBeUndefined();
    await expect(loadPreset(jsonFetcher({ model: 'qwen3-235b-awq', apiKey: 'k' }), resolveUrl)).resolves.toBeUndefined();
    await expect(loadPreset(jsonFetcher({ ...bundled, kind: 'cloud' }), resolveUrl)).resolves.toBeUndefined();
  });
  it('refuses a preset whose endpoint is not a local or private http host', async () => {
    await expect(loadPreset(jsonFetcher({ ...bundled, endpoint: 'https://api.openai.com/v1/chat/completions' }), resolveUrl)).resolves.toBeUndefined();
    await expect(loadPreset(jsonFetcher({ ...bundled, endpoint: 'http://8.8.8.8/v1/chat/completions' }), resolveUrl)).resolves.toBeUndefined();
  });
  it('swallows a fetch failure so a broken preset never blocks startup', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('PRIVATE_ERROR'));
    await expect(loadPreset(fetcher, resolveUrl)).resolves.toBeUndefined();
  });
});

describe('preset provider resolution', () => {
  const settings = presetSettings(bundled);
  it('registers preset as a first-class provider id', () => {
    expect(isProvider('preset')).toBe(true);
    expect(PRESET.kind).toBe('preset');
  });
  it('maps the preset settings onto its own kind, name, origin, and transport', () => {
    expect(settings.provider).toBe('preset');
    expect(settings.name).toBe('预设');
    expect(settings.endpoint).toBe(bundled.endpoint);
    const resolved = resolveProvider(settings);
    expect(resolved.kind).toBe('preset');
    expect(resolved.name).toBe('预设');
    expect(resolved.transport).toBe('openai');
    expect(resolved.origin).toBe(localEndpointOrigin(bundled.endpoint));
    expect(resolved.origin).toBe('http://10.75.128.152/*');
  });
  it('falls back to the registry display name when the settings carry none', () => {
    expect(resolveProvider({ provider: 'preset', model: 'm', apiKey: 'k', endpoint: bundled.endpoint }).name).toBe('Preset');
  });
  it('builds an OpenAI-shaped request against the fixed endpoint without leaking the key', () => {
    const request = buildRequest(settings, 'system', 'user');
    expect(request.url).toBe(bundled.endpoint);
    expect(request.url).not.toContain('synthetic-preset-key');
    expect(JSON.stringify(request.headers)).toContain('synthetic-preset-key');
    expect(JSON.stringify(request.body)).not.toContain('synthetic-preset-key');
    expect(JSON.stringify(request.body)).toContain('"max_tokens":8192');
  });
  it('validates a preset that carries its own key', () => {
    expect(() => validateSettings(settings)).not.toThrow();
  });
  it('keeps a private-LAN preset on manual send but auto-sends a loopback preset', () => {
    expect(defaultAutoSend(settings)).toBe(false);
    expect(defaultAutoSend(presetSettings({ ...bundled, endpoint: 'http://localhost:3000/v1/chat/completions' }))).toBe(true);
  });
});
