import { type UndoEntry, type ExecutionGuard, setNativeValue, verifyValue } from './fill';
import { assertRegistry, type Registry } from './scan';
import { readValue } from './controls';
import type { FillResult } from '../shared/schemas';
import { UserError, errorMessage } from '../shared/errors';
import { t } from '../shared/i18n';

export async function undoFill(registry: Registry, entries: UndoEntry[], expectedUrl: string, scanId: string, guard: ExecutionGuard): Promise<FillResult[]> {
  const results: FillResult[] = [];
  for (const entry of [...entries].reverse()) {
    try {
      if (guard.canceled() || !await guard.authorize()) throw new UserError(t('undoCanceled'));
      assertRegistry(registry, expectedUrl, scanId);
      if (!entry.element.isConnected || readValue(entry.element) !== entry.writtenValue) {
        results.push({ fieldId: entry.fieldId, status: 'skipped', detail: t('undoPreserved') });
        continue;
      }
      entry.element.focus({ preventScroll: true });
      assertRegistry(registry, expectedUrl, scanId);
      if (readValue(entry.element) !== entry.writtenValue || guard.canceled()) throw new UserError(t('undoTargetChanged'));
      setNativeValue(entry.element, entry.previousValue);
      const verified = await verifyValue(entry.element, entry.previousValue, false);
      results.push({ fieldId: entry.fieldId, status: verified ? 'restored' : 'changed/reverted', detail: verified ? t('undoRestored') : t('undoNotRetained') });
    } catch (error) {
      results.push({ fieldId: entry.fieldId, status: 'failed', detail: errorMessage(error) });
      break;
    }
  }
  return results;
}
