import { LIMITS, type LocalField, type Scan } from '../shared/schemas';
import { UserError } from '../shared/errors';

export type TextControl = HTMLInputElement | HTMLTextAreaElement;
export type RegisteredField = { element: TextControl; descriptor: LocalField; signature: string };
export type Registry = { scan: Scan; fields: Map<string, RegisteredField> };
const text = (value: string | null | undefined, max = 240) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const sensitive = /(?:password|passcode|\botp\b|\bpin\b|\bcvv\b|\bcvc\b|credit.?card|card.?number|security.?code|verification.?code|one.?time|routing.?number|bank.?account|\biban\b|social.?security|\bssn\b|captcha|密码|验证码|银行卡|信用卡|安全码)/i;

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
  const label = text(Array.from(element.labels ?? []).map(node => labelText(node)).join(' '));
  const group = element.closest('fieldset');
  const heading = labelText(group?.querySelector('legend') ?? element.closest('section')?.querySelector('h1,h2,h3'));
  return {
    id, type: element.tagName === 'TEXTAREA' ? 'textarea' : (element as HTMLInputElement).type as LocalField['type'],
    label, ariaLabel, placeholder: text(element.placeholder), name: text(element.name, 120), context: text(heading),
    required: element.required, maxLength: element.maxLength,
    pattern: element.tagName === 'INPUT' ? text((element as HTMLInputElement).pattern, 500) : '',
    currentValue: element.value,
  };
}
export function exclusion(element: TextControl): string | undefined {
  if (element.tagName === 'INPUT' && !['text', 'email', 'tel', 'url'].includes((element as HTMLInputElement).type)) return 'Unsupported input type';
  if (element.matches(':disabled') || element.readOnly || element.getAttribute('aria-disabled') === 'true') return 'Disabled or read-only';
  if (!isVisible(element)) return 'Hidden controls';
  const autocomplete = (element.autocomplete || element.form?.autocomplete || '').toLowerCase().split(/\s+/);
  if (autocomplete.some(token => token.startsWith('cc-') || ['one-time-code', 'current-password', 'new-password', 'username'].includes(token))) return 'Authentication or payment controls';
  const descriptor = describe(element, 'check');
  if (sensitive.test([descriptor.label, descriptor.ariaLabel, descriptor.placeholder, descriptor.name, element.id].join(' '))) return 'Potentially sensitive controls';
  if (element.value.length > LIMITS.value || (element.getAttribute('pattern')?.length ?? 0) > 500) return 'Control exceeds safety limits';
  return undefined;
}
export function fingerprint(element: TextControl): string {
  const { currentValue: _value, ...descriptor } = describe(element, 'fingerprint');
  return JSON.stringify({ ...descriptor, domId: element.id, autocomplete: element.autocomplete, form: element.form?.id ?? '' });
}
export function scanPage(doc: Document = document): Registry {
  const nodes = doc.querySelectorAll<TextControl>('input, textarea');
  if (nodes.length > 1_000) throw new UserError('This page has too many controls to scan safely. Use a simpler form.');
  const fields = new Map<string, RegisteredField>(), exclusions: Record<string, number> = {};
  for (const element of nodes) {
    const reason = exclusion(element);
    if (reason) { exclusions[reason] = (exclusions[reason] ?? 0) + 1; continue; }
    if (fields.size >= LIMITS.fields) throw new UserError('This page has more than 60 supported fields. No partial scan was used.');
    const id = crypto.randomUUID(), descriptor = describe(element, id);
    fields.set(id, { element, descriptor, signature: fingerprint(element) });
  }
  const unsupported = doc.querySelectorAll('select, [contenteditable="true"], iframe').length;
  if (unsupported) exclusions['Selects, rich text, or iframe containers'] = unsupported;
  return { scan: { scanId: crypto.randomUUID(), url: doc.location.href, fields: [...fields.values()].map(item => item.descriptor), exclusions }, fields };
}
export function assertRegistry(registry: Registry, expectedUrl: string, scanId: string) {
  if (registry.scan.scanId !== scanId || registry.scan.url !== expectedUrl || document.location.href !== expectedUrl) throw new UserError('The document or route changed. Scan and review again.');
  for (const field of registry.fields.values()) {
    if (!field.element.isConnected || exclusion(field.element) || fingerprint(field.element) !== field.signature) throw new UserError('The form changed after scanning. Scan and review again.');
  }
  // Added eligible fields also invalidate the scan, even if old references survived.
  const current = Array.from(document.querySelectorAll<TextControl>('input, textarea')).filter(element => !exclusion(element));
  if (current.length !== registry.fields.size || current.some(element => ![...registry.fields.values()].some(field => field.element === element))) {
    throw new UserError('The form structure changed. Scan and review again.');
  }
}
