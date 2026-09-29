import { describe, it, expect } from 'vitest';
import { sessionReducer, initialSession, fieldSignature, fillableRows, isBusy, type Session } from '../../src/sidepanel/session';
import type { BoundScan, LocalField, MappingPlan, OperationResult } from '../../src/shared/schemas';
import type { ParsedDocument } from '../../src/parsers/types';

const target = { tabId: 1, windowId: 1, documentId: 'doc-1', url: 'https://example.com/form' };
const field = (id: string, overrides: Partial<LocalField> = {}): LocalField => ({
  id, type: 'text', label: 'Name', ariaLabel: '', placeholder: '', name: 'name', context: 'Applicant',
  required: false, maxLength: -1, pattern: '', currentValue: '', ...overrides,
});
const scan = (scanId: string, fields: LocalField[], url = target.url): BoundScan => ({ scanId, url, fields, exclusions: {}, target });
const plan = (fieldIds: string[]): MappingPlan => ({
  assignments: fieldIds.map(fieldId => ({ fieldId, value: `value-${fieldId}`, evidence: [{ lineId: 'p1-l1', quote: 'quote' }], reason: 'matched' })),
  unmapped: [],
});
const result = (fieldId: string): OperationResult => ({ results: [{ fieldId, status: 'filled', detail: '' }], canUndo: true });
const document0 = { name: 'cv.pdf' } as unknown as ParsedDocument;
const review = (scanId: string, fields: LocalField[], fieldIds: string[]): Session =>
  sessionReducer(sessionReducer(initialSession, { type: 'DETECT', scan: scan(scanId, fields) }), { type: 'PLAN', scanId, plan: plan(fieldIds) });

describe('session reducer', () => {
  it('applies a plan only to the scan it was generated for', () => {
    const state = sessionReducer(initialSession, { type: 'DETECT', scan: scan('s1', [field('f1')]) });
    expect(sessionReducer(state, { type: 'PLAN', scanId: 'stale', plan: plan(['f1']) })).toBe(state);
  });
  it('arms empty fields and leaves occupied ones off', () => {
    const state = review('s1', [field('f1'), field('f2', { currentValue: 'Kept' })], ['f1', 'f2']);
    expect(state.rows.map(row => [row.fieldId, row.useAi])).toEqual([['f1', true], ['f2', false]]);
    expect(fillableRows(state.rows).map(row => row.fieldId)).toEqual(['f1']);
    expect(isBusy(state.phase)).toBe(false);
  });
  it('treats a checked box as occupied and an unchecked box as empty', () => {
    const state = review('s1', [field('on', { type: 'checkbox', currentValue: 'true' }), field('off', { type: 'checkbox', currentValue: 'false' })], ['on', 'off']);
    expect(state.rows.map(row => row.useAi)).toEqual([false, true]);
  });
  it('lets the master switch arm and disarm every row', () => {
    const state = review('s1', [field('f1'), field('f2')], ['f1', 'f2']);
    expect(sessionReducer(state, { type: 'SELECT_ALL', useAi: false }).rows.every(row => !row.useAi)).toBe(true);
    expect(sessionReducer(state, { type: 'SELECT_ALL', useAi: true }).rows.every(row => row.useAi)).toBe(true);
  });
  it('patches one row without touching the others', () => {
    const state = review('s1', [field('f1'), field('f2')], ['f1', 'f2']);
    const next = sessionReducer(state, { type: 'ROW', fieldId: 'f2', patch: { value: 'hand edit', useAi: true, manual: true } });
    expect(next.rows[1]).toMatchObject({ value: 'hand edit', useAi: true, manual: true });
    expect(next.rows[0].value).toBe('value-f1');
  });
  it('keeps manual edits and switches when only page values change', () => {
    let state = review('s1', [field('f1'), field('f2', { currentValue: 'Kept' })], ['f1', 'f2']);
    state = sessionReducer(state, { type: 'ROW', fieldId: 'f1', patch: { value: 'hand edit', manual: true } });
    const next = sessionReducer(state, { type: 'DETECT', scan: scan('s1', [field('f1', { currentValue: 'typed' }), field('f2', { currentValue: 'Kept' })]) });
    expect(next.rows[0]).toMatchObject({ fieldId: 'f1', value: 'hand edit', manual: true, useAi: true });
    expect(next.scan?.fields[0].currentValue).toBe('typed');
    expect(next.plan).toBeDefined();
  });
  it('re-keys rows, plan, and results when ids change but the field list does not', () => {
    let state = review('s1', [field('old1'), field('old2', { currentValue: 'Kept' })], ['old1', 'old2']);
    state = sessionReducer(state, { type: 'RESULT', result: result('old1') });
    state = sessionReducer(state, { type: 'ROW', fieldId: 'old1', patch: { value: 'hand edit', manual: true } });
    const next = sessionReducer(state, { type: 'DETECT', scan: scan('s2', [field('new1'), field('new2', { currentValue: 'Kept' })]) });
    expect(next.rows.map(row => row.fieldId)).toEqual(['new1', 'new2']);
    expect(next.rows[0]).toMatchObject({ value: 'hand edit', manual: true, useAi: true });
    expect(next.rows[1].useAi).toBe(false);
    expect(next.plan?.assignments.map(item => item.fieldId)).toEqual(['new1', 'new2']);
    expect(next.result?.results[0].fieldId).toBe('new1');
  });
  it('drops a stale review when the page structure changes, keeping documents and scan', () => {
    let state = sessionReducer(initialSession, { type: 'DOCUMENT', document: document0 });
    state = sessionReducer(state, { type: 'DETECT', scan: scan('s1', [field('f1')]) });
    state = sessionReducer(state, { type: 'PLAN', scanId: 's1', plan: plan(['f1']) });
    const next = sessionReducer(state, { type: 'DETECT', scan: scan('s3', [field('a'), field('b')]) });
    expect(next.documents).toHaveLength(1);
    expect(next.scan?.scanId).toBe('s3');
    expect(next.plan).toBeUndefined();
    expect(next.rows).toEqual([]);
  });
  it('drops the review when the active URL changes', () => {
    const state = review('s1', [field('f1')], ['f1']);
    const next = sessionReducer(state, { type: 'DETECT', scan: scan('s9', [field('f1')], 'https://example.com/other') });
    expect(next.plan).toBeUndefined();
    expect(next.rows).toEqual([]);
  });
  it('records detection failures without clearing the review and clears them on return', () => {
    const state = review('s1', [field('f1')], ['f1']);
    const failed = sessionReducer(state, { type: 'DETECT_FAIL', error: 'no access' });
    expect(failed.scanError).toBe('no access');
    expect(failed.plan).toBeDefined();
    expect(failed.rows).toHaveLength(1);
    const back = sessionReducer(failed, { type: 'DETECT', scan: scan('s1', [field('f1', { currentValue: 'typed' })]) });
    expect(back.scanError).toBeUndefined();
    expect(back.rows).toHaveLength(1);
  });
  it('keeps the live scan when a fill is invalidated or the provider changes', () => {
    const state = review('s1', [field('f1')], ['f1']);
    const invalidated = sessionReducer(state, { type: 'INVALIDATE', error: 'partial fill' });
    expect(invalidated.scan).toBeDefined();
    expect(invalidated.plan).toBeUndefined();
    expect(invalidated.error).toBe('partial fill');
    const changed = sessionReducer(state, { type: 'PROVIDER_CHANGED' });
    expect(changed.scan).toBeDefined();
    expect(changed.plan).toBeUndefined();
    expect(changed.error).toBeUndefined();
  });
  it('drops the plan when documents change and finishes the parsing phase', () => {
    const state = sessionReducer(review('s1', [field('f1')], ['f1']), { type: 'START', phase: 'parsing' });
    const next = sessionReducer(state, { type: 'DOCUMENT', document: document0 });
    expect(next.documents).toHaveLength(1);
    expect(next.scan).toBeDefined();
    expect(next.plan).toBeUndefined();
    expect(next.rows).toEqual([]);
    expect(next.phase).toBe('idle');
  });
  it('resets everything on RESET', () => {
    const state = review('s1', [field('f1')], ['f1']);
    expect(sessionReducer(state, { type: 'RESET' })).toEqual(initialSession);
  });
});

describe('fieldSignature', () => {
  it('ignores ids and current values but tracks metadata', () => {
    const a = field('a', { label: 'Full name' });
    const b = field('b', { label: 'Full name', currentValue: 'typed' });
    expect(fieldSignature(a)).toBe(fieldSignature(b));
    expect(fieldSignature(b)).not.toBe(fieldSignature({ ...b, label: 'Company' }));
  });
});
