import { t } from './i18n';

export class UserError extends Error {}
export function errorMessage(error: unknown): string {
  if (error instanceof UserError) return error.message;
  if (error instanceof DOMException && error.name === 'AbortError') return t('errCanceled');
  return t('errGeneric');
}
export function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
}
