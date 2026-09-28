import type { ProviderSettings } from '../ai/registry';

const AUTO_SEND_KEY = 'autoSend';
type Stored = { provider?: unknown; endpoint?: unknown; value?: unknown };

// Per-provider override for the auto-send switch. The stored entry only counts
// for the exact provider + endpoint it was saved with; anything else falls back
// to the derived default (loopback and on-device are auto, everything else is
// manual until the user opts in through the disclosure dialog).
export async function loadAutoSend(settings: ProviderSettings): Promise<boolean | undefined> {
  try {
    const all = await chrome.storage.local.get(AUTO_SEND_KEY);
    const stored = all[AUTO_SEND_KEY] as Stored | undefined;
    if (!stored || stored.provider !== settings.provider || (stored.endpoint ?? '') !== (settings.endpoint ?? '') || typeof stored.value !== 'boolean') return undefined;
    return stored.value;
  } catch { return undefined; }
}
export async function saveAutoSend(settings: ProviderSettings, value: boolean): Promise<void> {
  try { await chrome.storage.local.set({ [AUTO_SEND_KEY]: { provider: settings.provider, endpoint: settings.endpoint ?? '', value } }); }
  catch { /* the switch still works for this session */ }
}
