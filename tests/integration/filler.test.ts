import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { scanPage, type TextControl } from '../../src/content/scan';
import { executeFill, type UndoEntry } from '../../src/content/fill';
import { undoFill } from '../../src/content/undo';
const guard = { authorize: async () => true, canceled: () => false };
beforeEach(() => {
  document.body.innerHTML = '<form><fieldset><legend>Applicant</legend><label>Name<input name="name"></label><label>Email<input name="email" type="email"></label></fieldset></form>';
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 200, height: 30 } as DOMRect);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 200, height: 30 }] as unknown as DOMRectList);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 1));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const input = () => document.querySelector('input')!;
function setup(value = 'Alice') {
  const registry = scanPage(), field = registry.scan.fields[0];
  const writes = [{ fieldId: field.id, value, expectedValue: field.currentValue, allowOverwrite: false }];
  return { registry, writes, url: registry.scan.url, id: registry.scan.scanId };
}
async function complete<T>(promise: Promise<T>): Promise<T> { await vi.runAllTimersAsync(); return promise; }
describe('scanner', () => {
  it('extracts labels, roles, IDs, and context', () => {
    const scan = scanPage().scan;
    expect(scan.fields.map(field => field.label)).toEqual(['Name', 'Email']);
    expect(scan.fields[0].context).toBe('Applicant');
  });
  it('uses aria-labelledby rather than arbitrary nearby text', () => {
    document.body.innerHTML = '<span id="label">Company</span><input aria-labelledby="label">';
    expect(scanPage().scan.fields[0].ariaLabel).toBe('Company');
  });
  it('never includes nested control contents in labels, accessible names, or headings', () => {
    document.body.innerHTML = '<fieldset><legend>Applicant<select><option>Private selection</option></select></legend><label id="notes">Notes<textarea aria-labelledby="notes">Private existing text</textarea></label></fieldset>';
    const field = scanPage().scan.fields[0];
    expect(field.label).toBe('Notes'); expect(field.ariaLabel).toBe('Notes'); expect(field.context).toBe('Applicant');
    expect(field.currentValue).toBe('Private existing text');
  });
  it('excludes hidden, disabled fieldsets, password, readonly, and payment controls', () => {
    document.body.innerHTML += '<input type="password"><input hidden><input readonly><input autocomplete="cc-number"><fieldset disabled><input></fieldset><div style="opacity:0"><input></div><label>验证码<input></label>';
    expect(scanPage().scan.fields).toHaveLength(2);
  });
  it('rejects too many fields without partial results', () => {
    document.body.innerHTML = '<input>'.repeat(61);
    expect(() => scanPage()).toThrow('60');
  });
});
describe('safe execution', () => {
  it('fills native inputs and emits events without submitting', async () => {
    const { registry, writes, url, id } = setup();
    const events: string[] = [], submit = vi.fn();
    for (const name of ['input', 'change', 'blur']) input().addEventListener(name, () => events.push(name));
    document.querySelector('form')!.addEventListener('submit', submit);
    const undo: UndoEntry[] = [];
    const results = await complete(executeFill(registry, writes, url, id, guard, undo));
    expect(input().value).toBe('Alice'); expect(results[0].status).toBe('filled'); expect(events).toEqual(['input', 'change', 'blur']); expect(submit).not.toHaveBeenCalled(); expect(undo).toHaveLength(1);
  });
  it('rejects an unknown later field before making any writes', async () => {
    const { registry, writes, url, id } = setup();
    await expect(executeFill(registry, [...writes, { ...writes[0], fieldId: 'unknown' }], url, id, guard, [])).rejects.toThrow('Unknown'); expect(input().value).toBe('');
  });
  it('rejects an outdated scan ID', async () => {
    const { registry, writes, url } = setup();
    await expect(executeFill(registry, writes, url, 'old-scan', guard, [])).rejects.toThrow('changed'); expect(input().value).toBe('');
  });
  it('rejects changed labels, even on the same DOM element', async () => {
    const { registry, writes, url, id } = setup(); input().setAttribute('aria-label', 'A different person');
    await expect(executeFill(registry, writes, url, id, guard, [])).rejects.toThrow('changed');
  });
  it('rejects replaced elements', async () => {
    const { registry, writes, url, id } = setup(); input().replaceWith(input().cloneNode());
    await expect(executeFill(registry, writes, url, id, guard, [])).rejects.toThrow('changed');
  });
  it('rejects added fields', async () => {
    const { registry, writes, url, id } = setup(); document.body.append(document.createElement('input'));
    await expect(executeFill(registry, writes, url, id, guard, [])).rejects.toThrow('structure');
  });
  it('does not overwrite nonempty values without explicit approval', async () => {
    input().value = 'Original'; const { registry, writes, url, id } = setup();
    await expect(executeFill(registry, writes, url, id, guard, [])).rejects.toThrow('approval'); expect(input().value).toBe('Original');
  });
  it('can explicitly overwrite, including clearing an optional field', async () => {
    input().value = 'Original'; const { registry, writes, url, id } = setup(''); writes[0].allowOverwrite = true;
    const result = await complete(executeFill(registry, writes, url, id, guard, [])); expect(result[0].status).toBe('filled'); expect(input().value).toBe('');
  });
  it('rejects edits made after review', async () => {
    const { registry, writes, url, id } = setup(); input().value = 'User changed it';
    await expect(executeFill(registry, writes, url, id, guard, [])).rejects.toThrow('changed since review');
  });
  it('rejects maxlength and invalid email before writing', async () => {
    input().maxLength = 2; const { registry, writes, url, id } = setup();
    await expect(executeFill(registry, writes, url, id, guard, [])).rejects.toThrow('length');
    const email = registry.scan.fields[1];
    await expect(executeFill(registry, [{ ...writes[0], fieldId: email.id, value: 'not-an-email' }], url, id, guard, [])).rejects.toThrow('constraint');
  });
  it('does not write after tab authorization fails or cancellation', async () => {
    const { registry, writes, url, id } = setup();
    const result = await executeFill(registry, writes, url, id, { ...guard, authorize: async () => false }, []);
    expect(result[0].status).toBe('failed'); expect(input().value).toBe('');
    await executeFill(registry, writes, url, id, { ...guard, canceled: () => true }, []); expect(input().value).toBe('');
  });
  it('rechecks after focus handlers change a field', async () => {
    const { registry, writes, url, id } = setup(); input().addEventListener('focus', () => { input().value = 'Changed on focus'; });
    const result = await executeFill(registry, writes, url, id, guard, []); expect(result[0].status).toBe('failed'); expect(input().value).toBe('Changed on focus');
  });
  it('detects values reverted by the page after rendering', async () => {
    const { registry, writes, url, id } = setup(); input().addEventListener('input', () => setTimeout(() => { input().value = ''; }, 100));
    const result = await complete(executeFill(registry, writes, url, id, guard, [])); expect(result[0].status).toBe('changed/reverted');
  });
  it('undo restores only unchanged writes and verifies restoration', async () => {
    const { registry, writes, url, id } = setup(); const undo: UndoEntry[] = [];
    await complete(executeFill(registry, writes, url, id, guard, undo));
    const result = await complete(undoFill(registry, undo, url, id, guard)); expect(result[0].status).toBe('restored'); expect(input().value).toBe('');
  });
  it('undo tolerates controlled textarea default-value synchronization without changing labels', async () => {
    document.body.innerHTML = '<label>Notes<textarea></textarea></label>';
    const element = document.querySelector('textarea')!;
    element.addEventListener('input', () => { element.defaultValue = element.value; });
    const { registry, writes, url, id } = setup('Example note'); const undo: UndoEntry[] = [];
    await complete(executeFill(registry, writes, url, id, guard, undo));
    expect(element.textContent).toBe('Example note');
    const result = await complete(undoFill(registry, undo, url, id, guard));
    expect(result[0].status).toBe('restored'); expect(element.value).toBe('');
  });
  it('undo preserves subsequent user edits', async () => {
    const { registry, writes, url, id } = setup(); const undo: UndoEntry[] = [];
    await complete(executeFill(registry, writes, url, id, guard, undo)); input().value = 'User edit';
    const result = await undoFill(registry, undo, url, id, guard); expect(result[0].status).toBe('skipped'); expect(input().value).toBe('User edit');
  });
});
