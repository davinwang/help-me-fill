// AES-GCM sealing for the provider API key at rest. The random data key is
// generated once and kept in the same extension storage as the ciphertext, so
// this hides the key from plaintext disk inspection and casual leaks; it is
// obfuscation, not a hardware-backed vault. Non-sensitive settings
// (provider, model, endpoint) stay unencrypted for readability.
const DATA_KEY = 'secret-box:data-key';

function toBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// Import the persisted data key, creating and storing one on first use.
async function dataKey(): Promise<CryptoKey> {
  const stored = await chrome.storage.local.get(DATA_KEY);
  const raw = typeof stored[DATA_KEY] === 'string' ? fromBase64(stored[DATA_KEY] as string) : undefined;
  if (raw?.length === 32) return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const generated = crypto.getRandomValues(new Uint8Array(32));
  await chrome.storage.local.set({ [DATA_KEY]: toBase64(generated) });
  return crypto.subtle.importKey('raw', generated, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// Seal a key as "<iv>.<ciphertext>" (both base64). An empty key stays empty so
// local servers that need no key do not leave a blob behind.
export async function sealSecret(plaintext: string): Promise<string> {
  if (!plaintext) return '';
  const key = await dataKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(sealed))}`;
}

// Open a sealed key. Any tampering, a stale data key, or a malformed payload
// yields an empty string so the UI simply asks for the key again.
export async function openSecret(payload: string): Promise<string> {
  const [ivText, sealedText] = payload.split('.');
  if (!ivText || !sealedText) return '';
  try {
    const key = await dataKey();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(ivText) }, key, fromBase64(sealedText));
    return new TextDecoder().decode(plain);
  } catch { return ''; }
}
