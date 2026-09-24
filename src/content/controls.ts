import { LIMITS, type LocalField } from '../shared/schemas';
import { UserError } from '../shared/errors';

// Every control the filler can read, validate, write, and undo. Text-like
// inputs and textareas keep their native value; selects resolve to option
// labels; checkboxes resolve to "true"/"false"; editable regions to plain text.
export type SupportedControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;
export const DATE_TYPES = ['date', 'month', 'time', 'datetime-local'] as const;
export const TEXT_INPUT_TYPES = ['text', 'email', 'tel', 'url', ...DATE_TYPES] as const;
const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

export function isRichText(element: SupportedControl): boolean {
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') return false;
  const mode = element.getAttribute('contenteditable');
  return mode !== null && mode !== 'false';
}
export function controlType(element: SupportedControl): LocalField['type'] {
  if (element.tagName === 'TEXTAREA') return 'textarea';
  if (element.tagName === 'SELECT') return 'select';
  if (element.tagName === 'INPUT') return (element as HTMLInputElement).type as LocalField['type'];
  return 'richtext';
}
export function optionsOf(element: SupportedControl): string[] {
  if (element.tagName !== 'SELECT') return [];
  return Array.from((element as HTMLSelectElement).options).map(option => collapse(option.text)).filter(Boolean);
}
export function findOption(element: HTMLSelectElement, value: string): HTMLOptionElement | undefined {
  const target = collapse(value);
  return Array.from(element.options).find(option => collapse(option.text) === target || option.value === target);
}
export function readValue(element: SupportedControl): string {
  if (element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'checkbox') return (element as HTMLInputElement).checked ? 'true' : 'false';
  if (element.tagName === 'SELECT') {
    const option = (element as HTMLSelectElement).selectedOptions[0];
    return option ? collapse(option.text) : '';
  }
  if (isRichText(element)) return element.textContent ?? '';
  return (element as HTMLInputElement | HTMLTextAreaElement).value;
}
export function writeValue(element: SupportedControl, value: string) {
  const realm = element.ownerDocument.defaultView!;
  if (element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'checkbox') {
    (element as HTMLInputElement).checked = value === 'true';
    element.dispatchEvent(new realm.Event('input', { bubbles: true }));
    element.dispatchEvent(new realm.Event('change', { bubbles: true }));
    return;
  }
  if (element.tagName === 'SELECT') {
    const option = findOption(element as HTMLSelectElement, value);
    if (!option) throw new UserError('The selected value is not one of the field options.');
    (element as HTMLSelectElement).value = option.value;
    element.dispatchEvent(new realm.Event('input', { bubbles: true }));
    element.dispatchEvent(new realm.Event('change', { bubbles: true }));
    element.blur();
    return;
  }
  if (isRichText(element)) {
    // Plain text only: assigning textContent drops any markup, so a proposed
    // value can never inject HTML into the page.
    element.textContent = value;
    element.dispatchEvent(new realm.Event('input', { bubbles: true }));
    return;
  }
  const control = element as HTMLInputElement | HTMLTextAreaElement;
  const prototype = control.tagName === 'TEXTAREA' ? realm.HTMLTextAreaElement.prototype : realm.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) throw new UserError('This control has no supported native value setter.');
  setter.call(control, value);
  control.dispatchEvent(new realm.Event('input', { bubbles: true }));
  control.dispatchEvent(new realm.Event('change', { bubbles: true }));
  control.blur();
}
export function validateWriteValue(element: SupportedControl, value: string): string | undefined {
  const type = controlType(element);
  if (type === 'checkbox') return value === 'true' || value === 'false' ? undefined : 'Checkbox values must be "true" or "false".';
  if (type === 'select') return findOption(element as HTMLSelectElement, value) ? undefined : 'The value is not one of the field options.';
  if (type === 'richtext') return Array.from(value).length > LIMITS.value ? 'Value exceeds the field length limit.' : undefined;
  const control = element as HTMLInputElement | HTMLTextAreaElement;
  if (control.maxLength >= 0 && value.length > control.maxLength) return 'Value exceeds the field length limit.';
  if (control.minLength > 0 && value && value.length < control.minLength) return 'Value is shorter than the field minimum.';
  const probe = control.cloneNode(false) as HTMLInputElement | HTMLTextAreaElement;
  probe.value = value;
  if (probe.value !== value) return 'The browser would normalize this value. Edit it before filling.';
  if (!probe.validity.valid) return 'Value does not satisfy the field type, pattern, or required constraint.';
  return undefined;
}
