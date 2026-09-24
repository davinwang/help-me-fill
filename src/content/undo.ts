import { type UndoEntry, type ExecutionGuard, setNativeValue, verifyValue } from './fill';
import { assertRegistry, type Registry } from './scan';
import { readValue } from './controls';
import type { FillResult } from '../shared/schemas';
import { UserError, errorMessage } from '../shared/errors';

export async function undoFill(registry: Registry, entries: UndoEntry[], expectedUrl: string, scanId: string, guard: ExecutionGuard): Promise<FillResult[]> {
  const results: FillResult[] = [];
  for (const entry of [...entries].reverse()) {
    try {
      if (guard.canceled() || !await guard.authorize()) throw new UserError('Undo stopped because the operation was canceled or the tab changed.');
      assertRegistry(registry, expectedUrl, scanId);
      if (!entry.element.isConnected || readValue(entry.element) !== entry.writtenValue) {
        results.push({ fieldId: entry.fieldId, status: 'skipped', detail: 'Preserved a subsequent user or page edit.' });
        continue;
      }
      entry.element.focus({ preventScroll: true });
      assertRegistry(registry, expectedUrl, scanId);
      if (readValue(entry.element) !== entry.writtenValue || guard.canceled()) throw new UserError('The target changed during undo.');
      setNativeValue(entry.element, entry.previousValue);
      const verified = await verifyValue(entry.element, entry.previousValue, false);
      results.push({ fieldId: entry.fieldId, status: verified ? 'restored' : 'changed/reverted', detail: verified ? 'Previous value restored. Page-side effects cannot be undone.' : 'The page did not retain the previous value.' });
    } catch (error) {
      results.push({ fieldId: entry.fieldId, status: 'failed', detail: errorMessage(error) });
      break;
    }
  }
  return results;
}
