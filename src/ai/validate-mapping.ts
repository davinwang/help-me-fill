import { LIMITS, MappingSchema, type FieldDescriptor } from '../shared/schemas';
import type { DocumentLine } from '../parsers/types';
import { UserError } from '../shared/errors';

export class MappingError extends UserError {}
const normalizeWhitespace = (value: string) => value.replace(/\s+/gu, ' ').trim();
export function validateMapping(raw: string, lines: DocumentLine[], fields: FieldDescriptor[]) {
  if (new TextEncoder().encode(raw).length > LIMITS.responseBytes) throw new MappingError('The model output exceeded the response limit.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new MappingError('The model did not return valid JSON.'); }
  const parsed = MappingSchema.safeParse(value);
  if (!parsed.success) throw new MappingError('The model output did not match the required mapping schema.');
  const plan = parsed.data, seen = new Set<string>();
  const fieldMap = new Map(fields.map(field => [field.id, field]));
  const lineMap = new Map(lines.map(line => [line.id, line.text]));
  for (const entry of [...plan.assignments, ...plan.unmapped]) {
    if (!fieldMap.has(entry.fieldId) || seen.has(entry.fieldId)) throw new MappingError('The model returned an unknown or duplicate field ID.');
    seen.add(entry.fieldId);
  }
  if (seen.size !== fields.length) throw new MappingError('The model did not account for every field.');
  for (const assignment of plan.assignments) {
    const field = fieldMap.get(assignment.fieldId)!;
    for (const evidence of assignment.evidence) {
      if (!lineMap.get(evidence.lineId)?.includes(evidence.quote)) throw new MappingError('A source quote was not present on its cited line.');
    }
    const source = normalizeWhitespace(assignment.evidence.map(item => item.quote).join(' '));
    const proposed = normalizeWhitespace(assignment.value);
    if (!proposed || !source.includes(proposed)) throw new MappingError('A proposed value was not supported by its cited evidence.');
    if (field.maxLength >= 0 && assignment.value.length > field.maxLength) throw new MappingError('A proposed value exceeds the field length limit.');
  }
  return plan;
}
