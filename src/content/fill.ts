import type { WriteAssignment } from '../shared/messages';
import type { FillResult } from '../shared/schemas';
import { UserError, errorMessage } from '../shared/errors';
import { t } from '../shared/i18n';
import { assertRegistry, type Registry, type TextControl } from './scan';
import { readValue, writeValue, validateWriteValue } from './controls';

export type UndoEntry = { fieldId: string; element: TextControl; previousValue: string; writtenValue: string };
export type ExecutionGuard = { authorize: () => Promise<boolean>; canceled: () => boolean };
export function validateControlValue(element: TextControl, value: string): string | undefined {
  return validateWriteValue(element, value);
}
export function setNativeValue(element: TextControl, value: string) {
  writeValue(element, value);
}
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export async function verifyValue(element: TextControl, value: string, checkValidity = true): Promise<boolean> {
  const realm = element.ownerDocument.defaultView!;
  await new Promise<void>(resolve => {
    let frame = 0;
    const timer = setTimeout(() => { realm.cancelAnimationFrame(frame); resolve(); }, 100);
    frame = realm.requestAnimationFrame(() => { clearTimeout(timer); resolve(); });
  });
  const matches = () => element.isConnected && readValue(element) === value
    && (!checkValidity || !('validity' in element) || (element as HTMLInputElement).validity.valid);
  if (!matches()) return false;
  await sleep(300);
  if (!matches()) return false;
  await sleep(700);
  return matches();
}
export async function executeFill(registry: Registry, writes: WriteAssignment[], expectedUrl: string, scanId: string, guard: ExecutionGuard, undo: UndoEntry[]): Promise<FillResult[]> {
  assertRegistry(registry, expectedUrl, scanId);
  const seen = new Set<string>();
  // Full preflight prevents an invalid later assignment from allowing earlier writes.
  for (const write of writes) {
    const field = registry.fields.get(write.fieldId);
    if (!field || seen.has(write.fieldId)) throw new UserError(t('fillUnknownField'));
    seen.add(write.fieldId);
    if (readValue(field.element) !== write.expectedValue || field.descriptor.currentValue !== write.expectedValue) throw new UserError(t('fillChangedSinceReview'));
    // An unchecked box holds no user data, so ticking it is not an overwrite.
    const hasExisting = field.descriptor.type === 'checkbox' ? write.expectedValue === 'true' : write.expectedValue !== '';
    if (hasExisting && !write.allowOverwrite) throw new UserError(t('fillNeedsApproval'));
    const invalid = validateControlValue(field.element, write.value);
    if (invalid) throw new UserError(invalid);
  }
  const results: FillResult[] = [];
  for (let index = 0; index < writes.length; index++) {
    const write = writes[index], field = registry.fields.get(write.fieldId)!;
    try {
      if (guard.canceled() || !await guard.authorize()) throw new UserError(t('fillCanceledOrInactive'));
      assertRegistry(registry, expectedUrl, scanId);
      if (readValue(field.element) !== write.expectedValue) throw new UserError(t('fillValueChangedDuring'));
      if (readValue(field.element) === write.value) {
        results.push({ fieldId: write.fieldId, status: 'skipped', detail: t('fillAlreadyContains') });
        continue;
      }
      field.element.focus({ preventScroll: true });
      // Focus handlers can replace the control or change its value synchronously.
      assertRegistry(registry, expectedUrl, scanId);
      if (readValue(field.element) !== write.expectedValue || guard.canceled()) throw new UserError(t('fillChangedOnFocus'));
      undo.push({ fieldId: write.fieldId, element: field.element, previousValue: readValue(field.element), writtenValue: write.value });
      setNativeValue(field.element, write.value);
      const verified = await verifyValue(field.element, write.value);
      results.push({ fieldId: write.fieldId, status: verified ? 'filled' : 'changed/reverted', detail: verified ? t('fillVerified') : t('fillReverted') });
    } catch (error) {
      results.push({ fieldId: write.fieldId, status: 'failed', detail: errorMessage(error) });
      results.push(...writes.slice(index + 1).map(item => ({ fieldId: item.fieldId, status: 'skipped' as const, detail: t('fillStopped') })));
      break;
    }
  }
  return results;
}
