import { z } from 'zod';
import { localEndpointOrigin } from './registry';

// Name of the build-time bundled preset file. It is copied into dist/ by
// scripts/build.mjs only when a local preset-llm.json exists at the repo root.
// It is intentionally NOT declared in web_accessible_resources: it carries an
// API key, so only the extension's own pages (same extension origin) may read it.
export const PRESET_FILE = 'preset-llm.json';

const PresetSchema = z.object({
  name: z.string().min(1).max(60),
  kind: z.literal('preset'),
  endpoint: z.string().min(1).max(2048),
  model: z.string().min(1).max(120),
  apiKey: z.string().max(1024),
}).strict();

export type PresetConfig = z.infer<typeof PresetSchema>;

// Load the bundled preset, if any. Returns undefined when the file is absent,
// unreadable, malformed, or points at something that is not a local/private
// http endpoint — a broken preset must never block the panel from starting.
export async function loadPreset(
  fetcher: typeof fetch = fetch,
  resolveUrl: (path: string) => string = path => chrome.runtime.getURL(path),
): Promise<PresetConfig | undefined> {
  try {
    const response = await fetcher(resolveUrl(PRESET_FILE), { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) return undefined;
    const parsed = PresetSchema.safeParse(await response.json());
    if (!parsed.success) return undefined;
    localEndpointOrigin(parsed.data.endpoint); // throws for non-local/private hosts
    return parsed.data;
  } catch { return undefined; }
}

// The ProviderSettings a preset resolves to. Name, endpoint, model, and key are
// all fixed by the file; the settings UI renders them read-only.
export function presetSettings(preset: PresetConfig): { provider: 'preset'; name: string; model: string; apiKey: string; endpoint: string } {
  return { provider: 'preset', name: preset.name, model: preset.model, apiKey: preset.apiKey, endpoint: preset.endpoint };
}
