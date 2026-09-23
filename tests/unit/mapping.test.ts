import { describe, it, expect } from 'vitest';
import { validateMapping } from '../../src/ai/validate-mapping';
import { compactFields } from '../../src/ai/prompts';
import { sessionReducer, initialSession } from '../../src/sidepanel/session';
import type { FieldDescriptor, MappingPlan } from '../../src/shared/schemas';
import { benchmarkCases } from '../fixtures/cases';

export const field: FieldDescriptor = { id: 'f1', type: 'text', label: '姓名 / Name', ariaLabel: '', placeholder: '', name: 'name', context: 'Applicant', required: true, maxLength: 100, pattern: '' };
const lines = [{ id: 'p1-l1', page: 1, text: '姓名: 陈小明' }, { id: 'p1-l2', page: 1, text: 'Reference: 00123' }];
const plan: MappingPlan = { assignments: [{ fieldId: 'f1', value: '陈小明', evidence: [{ lineId: 'p1-l1', quote: '陈小明' }], reason: 'Applicant name' }], unmapped: [] };
const parse = (value: unknown, fields = [field]) => validateMapping(JSON.stringify(value), lines, fields);
describe('grounded mapping validation', () => {
  it('preserves Chinese characters and exact source evidence', () => expect(parse(plan)).toEqual(plan));
  it('preserves leading zero identifiers', () => expect(parse({ ...plan, assignments: [{ ...plan.assignments[0], value: '00123', evidence: [{ lineId: 'p1-l2', quote: '00123' }] }] }).assignments[0].value).toBe('00123'));
  it('rejects prose and invalid JSON', () => expect(() => validateMapping('Here is a plan', lines, [field])).toThrow('valid JSON'));
  it('rejects extra executable properties', () => expect(() => parse({ ...plan, script: 'submit()' })).toThrow('schema'));
  it('rejects unknown field IDs', () => expect(() => parse({ ...plan, assignments: [{ ...plan.assignments[0], fieldId: 'evil' }] })).toThrow('field ID'));
  it('rejects duplicate assignments', () => expect(() => parse({ ...plan, assignments: [plan.assignments[0], plan.assignments[0]] })).toThrow('duplicate'));
  it('rejects assigned plus unmapped duplicates', () => expect(() => parse({ ...plan, unmapped: [{ fieldId: 'f1', reason: 'missing' }] })).toThrow('duplicate'));
  it('requires accounting for all fields', () => expect(() => parse({ assignments: [], unmapped: [] })).toThrow('every field'));
  it('allows explicit abstention', () => expect(parse({ assignments: [], unmapped: [{ fieldId: 'f1', reason: 'Ambiguous applicant' }] }).assignments).toHaveLength(0));
  it('rejects fabricated facts even with a real quote', () => expect(() => parse({ ...plan, assignments: [{ ...plan.assignments[0], value: 'Somebody else' }] })).toThrow('supported'));
  it('rejects quotes on the wrong line', () => expect(() => parse({ ...plan, assignments: [{ ...plan.assignments[0], evidence: [{ lineId: 'p1-l2', quote: '陈小明' }] }] })).toThrow('cited line'));
  it('rejects whitespace-only values', () => expect(() => parse({ ...plan, assignments: [{ ...plan.assignments[0], value: ' ' }] })).toThrow('supported'));
  it('respects maxlength', () => expect(() => parse(plan, [{ ...field, maxLength: 1 }])).toThrow('length'));
  it('does not send current values or arbitrary fields to the provider', () => {
    const result = compactFields([{ ...field, currentValue: 'PRIVATE_VALUE' }]);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_VALUE');
    expect(result[0]).toEqual(field);
  });
});
describe('frozen synthetic benchmark integrity (not live model accuracy)', () => {
  it('contains 12 cases and 120 unique labeled opportunities', () => {
    expect(benchmarkCases).toHaveLength(12);
    expect(new Set(benchmarkCases.map(item => item.id)).size).toBe(12);
    expect(benchmarkCases.reduce((count, item) => count + item.fields.length, 0)).toBe(120);
  });
  it.each(benchmarkCases)('$id: oracle values have source evidence and missing facts remain unmapped', scenario => {
    const documentLines = scenario.lines.map((text, index) => ({ id: `p1-l${index + 1}`, page: 1, text }));
    const fields = scenario.fields.map(item => ({ ...field, id: item.name, name: item.name, label: item.label, type: item.type, context: scenario.context }));
    const oracle: MappingPlan = { assignments: [], unmapped: [] };
    for (const item of scenario.fields) {
      if (item.expected === null) oracle.unmapped.push({ fieldId: item.name, reason: 'Fact absent from source' });
      else {
        const line = documentLines.find(line => line.text.includes(item.expected!));
        expect(line).toBeDefined();
        oracle.assignments.push({ fieldId: item.name, value: item.expected, evidence: [{ lineId: line!.id, quote: item.expected }], reason: 'Synthetic oracle' });
      }
    }
    expect(validateMapping(JSON.stringify(oracle), documentLines, fields)).toEqual(oracle);
  });
});
describe('review defaults', () => {
  it('starts all model suggestions unchecked', () => {
    const state = sessionReducer(initialSession, { type: 'PLAN', plan, metrics: 'mock' });
    expect(state.rows[0].selected).toBe(false);
    expect(state.rows[0].allowOverwrite).toBe(false);
  });
  it('drops plans on target invalidation', () => {
    const state = sessionReducer(sessionReducer(initialSession, { type: 'PLAN', plan, metrics: '' }), { type: 'INVALIDATE', error: 'tab switched' });
    expect(state.rows).toEqual([]); expect(state.plan).toBeUndefined(); expect(state.scan).toBeUndefined();
  });
});
