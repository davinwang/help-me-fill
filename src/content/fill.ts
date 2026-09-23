import type { WriteAssignment } from '../shared/messages';
import type { FillResult } from '../shared/schemas';
import { UserError, errorMessage } from '../shared/errors';
import { assertRegistry, type Registry, type TextControl } from './scan';

export type UndoEntry = { fieldId: string; element: TextControl; previousValue: string; writtenValue: string };
export type ExecutionGuard = { authorize: () => Promise<boolean>; canceled: () => boolean };
export function validateControlValue(element: TextControl, value: string): string | undefined {
  if (element.maxLength >= 0 && value.length > element.maxLength) return 'Value exceeds the field length limit.';
  if (element.minLength > 0 && value && value.length < element.minLength) return 'Value is shorter than the field minimum.';
  const probe = element.cloneNode(false) as TextControl;
  probe.value = value;
  if (probe.value !== value) return 'The browser would normalize this value. Edit it before filling.';
  if (!probe.validity.valid) return 'Value does not satisfy the field type, pattern, or required constraint.';
  return undefined;
}
export function setNativeValue(element: TextControl, value: string) {
  const realm = element.ownerDocument.defaultView!;
  const prototype = element.tagName === 'TEXTAREA' ? realm.HTMLTextAreaElement.prototype : realm.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) throw new UserError('This control has no supported native value setter.');
  setter.call(element, value);
  element.dispatchEvent(new realm.Event('input', { bubbles: true }));
  element.dispatchEvent(new realm.Event('change', { bubbles: true }));
  element.blur();
}
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export async function verifyValue(element: TextControl, value: string, checkValidity = true): Promise<boolean> {
  const realm = element.ownerDocument.defaultView!;
  await new Promise<void>(resolve => {
    let frame = 0;
    const timer = setTimeout(() => { realm.cancelAnimationFrame(frame); resolve(); }, 100);
    frame = realm.requestAnimationFrame(() => { clearTimeout(timer); resolve(); });
  });
  const matches = () => element.isConnected && element.value === value && (!checkValidity || element.validity.valid);
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
    if (!field || seen.has(write.fieldId)) throw new UserError('Unknown or duplicate field ID. Nothing was filled.');
    seen.add(write.fieldId);
    if (field.element.value !== write.expectedValue || field.descriptor.currentValue !== write.expectedValue) throw new UserError('A field changed since review. Scan and review again.');
    if (write.expectedValue !== '' && !write.allowOverwrite) throw new UserError('Overwriting an existing value requires explicit approval.');
    const invalid = validateControlValue(field.element, write.value);
    if (invalid) throw new UserError(invalid);
  }
  const results: FillResult[] = [];
  for (let index = 0; index < writes.length; index++) {
    const write = writes[index], field = registry.fields.get(write.fieldId)!;
    try {
      if (guard.canceled() || !await guard.authorize()) throw new UserError('The operation was canceled or the target tab is no longer active.');
      assertRegistry(registry, expectedUrl, scanId);
      if (field.element.value !== write.expectedValue) throw new UserError('A field value changed during filling. Review again.');
      if (field.element.value === write.value) {
        results.push({ fieldId: write.fieldId, status: 'skipped', detail: 'Already contains the selected value.' });
        continue;
      }
      field.element.focus({ preventScroll: true });
      // Focus handlers can replace the control or change its value synchronously.
      assertRegistry(registry, expectedUrl, scanId);
      if (field.element.value !== write.expectedValue || guard.canceled()) throw new UserError('The target changed on focus. Remaining fields were not filled.');
      undo.push({ fieldId: write.fieldId, element: field.element, previousValue: field.element.value, writtenValue: write.value });
      setNativeValue(field.element, write.value);
      const verified = await verifyValue(field.element, write.value);
      results.push({ fieldId: write.fieldId, status: verified ? 'filled' : 'changed/reverted', detail: verified ? 'Value and native validity persisted through verification.' : 'The page changed, rejected, or replaced this value. Inspect it manually.' });
    } catch (error) {
      results.push({ fieldId: write.fieldId, status: 'failed', detail: errorMessage(error) });
      results.push(...writes.slice(index + 1).map(item => ({ fieldId: item.fieldId, status: 'skipped' as const, detail: 'Stopped after a target change or execution failure.' })));
      break;
    }
  }
  return results;
}
