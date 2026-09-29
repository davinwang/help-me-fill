import type { ProviderId, ProviderSettings } from '../ai/registry';

const AUTO_SEND_KEY = 'autoSend';
// One "don't ask again" flag per provider, keyed by provider id. A provider
// without a stored flag falls back to its derived default (on-device and
// loopback servers are auto, everything else is manual until the user opts in
// through the disclosure dialog). Saving or removing a key clears its flag.
type Stored = Partial<Record<ProviderId, boolean>>;

async function read(): Promise<Stored> {
  try {
    const all = await chrome.storage.local.get(AUTO_SEND_KEY);
    const stored = all[AUTO_SEND_KEY];
    return stored && typeof stored === 'object' ? stored as Stored : {};
  } catch { return {}; }
}
async function write(stored: Stored): Promise<void> {
  try { await chrome.storage.local.set({ [AUTO_SEND_KEY]: stored }); }
  catch { /* the switch still works for this session */ }
}

export async function loadAutoSend(settings: ProviderSettings): Promise<boolean | undefined> {
  const value = (await read())[settings.provider];
  return typeof value === 'boolean' ? value : undefined;
}
export async function saveAutoSend(settings: ProviderSettings, value: boolean): Promise<void> {
  await write({ ...await read(), [settings.provider]: value });
}
// Re-configuring a provider (saving a verified key or removing it) invalidates
// its auto-send consent: the flag is set to an explicit false so the next send
// asks again, overriding even a loopback/on-device default that starts auto.
export async function resetAutoSend(provider: ProviderId): Promise<void> {
  await write({ ...await read(), [provider]: false });
}
