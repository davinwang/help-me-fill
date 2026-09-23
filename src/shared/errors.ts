export class UserError extends Error {}
export function errorMessage(error: unknown): string {
  if (error instanceof UserError) return error.message;
  if (error instanceof DOMException && error.name === 'AbortError') return 'Canceled. No new request was started.';
  return 'The operation could not complete. Reset the session and try again.';
}
export function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
}
