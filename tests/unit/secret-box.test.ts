// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { openSecret, sealSecret } from '../../src/shared/secret-box';

// Minimal in-memory chrome.storage.local stand-in; Node provides WebCrypto,
// btoa/atob and the text codecs the module relies on.
function installStorage() {
  const store = new Map<string, unknown>();
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: async (key: string) => (store.has(key) ? { [key]: store.get(key) } : {}),
        set: async (items: Record<string, unknown>) => { for (const [name, value] of Object.entries(items)) store.set(name, value); },
      },
    },
  };
  return store;
}

describe('secret box', () => {
  beforeEach(() => { installStorage(); });

  it('seals and opens a key round-trip', async () => {
    const sealed = await sealSecret('sk-secret-value');
    expect(sealed).not.toContain('sk-secret-value');
    expect(sealed.split('.')).toHaveLength(2);
    expect(await openSecret(sealed)).toBe('sk-secret-value');
  });

  it('leaves an empty key unsealed so keyless local servers store nothing', async () => {
    expect(await sealSecret('')).toBe('');
    expect(await openSecret('')).toBe('');
  });

  it('returns empty for a tampered or malformed payload', async () => {
    const sealed = await sealSecret('real-key');
    const [iv, data] = sealed.split('.');
    const tampered = `${iv}.${data.slice(0, -2) + (data.endsWith('AA') ? 'AB' : 'AA')}`;
    expect(await openSecret(tampered)).toBe('');
    expect(await openSecret('not-a-valid-payload')).toBe('');
  });

  it('never writes the plaintext key into storage', async () => {
    const store = installStorage();
    await sealSecret('plaintext-needle');
    expect(JSON.stringify([...store.values()])).not.toContain('plaintext-needle');
  });
});
