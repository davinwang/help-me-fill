import { LIMITS, type LocalField, type Scan } from '../shared/schemas';
import { UserError } from '../shared/errors';
import { controlType, isRichText, optionsOf, readValue, TEXT_INPUT_TYPES, type SupportedControl } from './controls';

export type TextControl = SupportedControl;
export type RegisteredField = { element: TextControl; descriptor: LocalField; signature: string };
export type Registry = { scan: Scan; fields: Map<string, RegisteredField> };
const text = (value: string | null | undefined, max = 240) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const sensitive = /(?:password|passcode|\botp\b|\bpin\b|\bcvv\b|\bcvc\b|credit.?card|card.?number|security.?code|verification.?code|one.?time|routing.?number|bank.?account|\biban\b|social.?security|\bssn\b|captcha|密码|验证码|银行卡|信用卡|安全码)/i;
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export function isVisible(element: HTMLElement): boolean {
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = node.ownerDocument.defaultView!.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && element.getClientRects().length > 0;
}
const nonLabelText = 'input, textarea, select, option, button, output, [contenteditable], script, style, template';
function labelText(root: Element | null | undefined): string {
  if (!root || root.matches(nonLabelText)) return '';
  // React synchronizes textarea defaultValue into its text node. Control contents
  // are values, not labels: excluding them also keeps them out of AI metadata.
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.nodeType === Node.TEXT_NODE ? NodeFilter.FILTER_ACCEPT
      : (node as Element).matches(nonLabelText) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP,
  });
  let result = '', node: Node | null, visited = 0;
  while (visited++ < 1_000 && result.length < 2_000 && (node = walker.nextNode())) result += (node.textContent ?? '').slice(0, 2_000 - result.length);
  return result;
}
export function describe(element: TextControl, id: string): LocalField {
  const doc = element.ownerDocument;
  const ariaIds = (element.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
  const ariaLabel = text(ariaIds.map(id => labelText(doc.getElementById(id))).join(' ') || element.getAttribute('aria-label'));
  const label = text(('labels' in element ? Array.from((element as HTMLInputElement).labels ?? []) : []).map(node => labelText(node)).join(' '));
  const group = element.closest('fieldset');
  const heading = labelText(group?.querySelector('legend') ?? element.closest('section')?.querySelector('h1,h2,h3'));
  const placeholder = 'placeholder' in element ? text((element as HTMLInputElement).placeholder) : text(element.getAttribute('data-placeholder'));
  const required = 'required' in element ? Boolean((element as HTMLInputElement).required) : element.getAttribute('aria-required') === 'true';
  const maxLength = 'maxLength' in element ? (element as HTMLInputElement).maxLength : -1;
  return {
    id, type: controlType(element),
    label, ariaLabel, placeholder, name: text(element.getAttribute('name'), 120), context: text(heading),
    required, maxLength,
    pattern: element.tagName === 'INPUT' ? text((element as HTMLInputElement).pattern, 500) : '',
    options: optionsOf(element),
    currentValue: readValue(element),
  };
}
export function exclusion(element: TextControl): string | undefined {
  if (element.tagName === 'INPUT' && !(TEXT_INPUT_TYPES as readonly string[]).includes((element as HTMLInputElement).type) && (element as HTMLInputElement).type !== 'checkbox') return 'Unsupported input type';
  if (element.tagName === 'SELECT') {
    if ((element as HTMLSelectElement).multiple) return 'Multi-select controls';
    if (!optionsOf(element).length) return 'Select without options';
  }
  if (isRichText(element) && element.parentElement?.closest('[contenteditable]:not([contenteditable="false"])')) return 'Nested editable regions';
  if (element.matches(':disabled') || ('readOnly' in element && (element as HTMLInputElement).readOnly) || element.getAttribute('aria-disabled') === 'true') return 'Disabled or read-only';
  if (!isVisible(element)) return 'Hidden controls';
  const autocomplete = (('autocomplete' in element ? (element as HTMLInputElement).autocomplete : '') || ('form' in element ? (element as HTMLInputElement).form?.autocomplete : '') || '').toLowerCase().split(/\s+/);
  if (autocomplete.some(token => token.startsWith('cc-') || ['one-time-code', 'current-password', 'new-password', 'username'].includes(token))) return 'Authentication or payment controls';
  const descriptor = describe(element, 'check');
  if (sensitive.test([descriptor.label, descriptor.ariaLabel, descriptor.placeholder, descriptor.name, element.id].join(' '))) return 'Potentially sensitive controls';
  if (readValue(element).length > LIMITS.value || (element.getAttribute('pattern')?.length ?? 0) > 500) return 'Control exceeds safety limits';
  return undefined;
}
export function fingerprint(element: TextControl): string {
  const { currentValue: _value, ...descriptor } = describe(element, 'fingerprint');
  return JSON.stringify({ ...descriptor, domId: element.id, autocomplete: 'autocomplete' in element ? (element as HTMLInputElement).autocomplete : '', form: 'form' in element ? (element as HTMLInputElement).form?.id ?? '' : '' });
}
export function scanPage(doc: Document = document): Registry {
  const nodes = doc.querySelectorAll<TextControl>(EDITABLE_SELECTOR);
  if (nodes.length > 1_000) throw new UserError('This page has too many controls to scan safely. Use a simpler form.');
  const fields = new Map<string, RegisteredField>(), exclusions: Record<string, number> = {};
  for (const element of nodes) {
    const reason = exclusion(element);
    if (reason) { exclusions[reason] = (exclusions[reason] ?? 0) + 1; continue; }
    if (fields.size >= LIMITS.fields) throw new UserError('This page has more than 60 supported fields. No partial scan was used.');
    const id = crypto.randomUUID(), descriptor = describe(element, id);
    fields.set(id, { element, descriptor, signature: fingerprint(element) });
  }
  const unsupported = doc.querySelectorAll('iframe').length;
  if (unsupported) exclusions['Iframe containers'] = unsupported;
  return { scan: { scanId: crypto.randomUUID(), url: doc.location.href, fields: [...fields.values()].map(item => item.descriptor), exclusions }, fields };
}
export function assertRegistry(registry: Registry, expectedUrl: string, scanId: string) {
  if (registry.scan.scanId !== scanId || registry.scan.url !== expectedUrl || document.location.href !== expectedUrl) throw new UserError('The document or route changed. Scan and review again.');
  for (const field of registry.fields.values()) {
    if (!field.element.isConnected || exclusion(field.element) || fingerprint(field.element) !== field.signature) throw new UserError('The form changed after scanning. Scan and review again.');
  }
  // Added eligible fields also invalidate the scan, even if old references survived.
  const current = Array.from(document.querySelectorAll<TextControl>(EDITABLE_SELECTOR)).filter(element => !exclusion(element));
  if (current.length !== registry.fields.size || current.some(element => ![...registry.fields.values()].some(field => field.element === element))) {
    throw new UserError('The form structure changed. Scan and review again.');
  }
}
