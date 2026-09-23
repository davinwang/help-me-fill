// Capability gate for the browser on-device model (Chrome Prompt API / Gemini
// Nano, Edge Prompt API / Phi-4-mini or Aion). The option is offered only when
// the API global exists AND the browser reports the model as reachable; Edge
// stable and unsupported devices therefore never show it.
export type BuiltinState = 'available' | 'downloadable' | 'downloading';
export type BuiltinSession = {
  prompt(input: string, options?: { responseConstraint?: unknown; signal?: AbortSignal }): Promise<string>;
  countPromptTokens?(input: string, options?: { responseConstraint?: unknown }): Promise<number>;
  inputTokensLeft: number;
  destroy(): void;
};
export type BuiltinApi = {
  availability(options?: unknown): Promise<string>;
  create(options: {
    initialPrompts?: Array<{ role: string; content: string }>;
    signal?: AbortSignal;
    monitor?: (monitor: { addEventListener(type: 'downloadprogress', listener: (event: { loaded: number; total: number }) => void): void }) => void;
  }): Promise<BuiltinSession>;
};
export function builtinApi(): BuiltinApi | undefined {
  const scope = globalThis as Record<string, any>;
  const api = scope.LanguageModel ?? scope.ai?.languageModel;
  return api && typeof api.create === 'function' && typeof api.availability === 'function' ? api as BuiltinApi : undefined;
}
export async function detectBuiltin(): Promise<BuiltinState | undefined> {
  const api = builtinApi();
  if (!api) return undefined;
  try {
    const state = await api.availability();
    return state === 'available' || state === 'downloadable' || state === 'downloading' ? state : undefined;
  } catch {
    return undefined;
  }
}
