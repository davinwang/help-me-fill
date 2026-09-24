import { LIMITS, MappingSchema, type FieldDescriptor } from '../shared/schemas';
import type { DocumentLine } from '../parsers/types';
import { UserError } from '../shared/errors';
import { t } from '../shared/i18n';

export class MappingError extends UserError {}
const normalizeWhitespace = (value: string) => value.replace(/\s+/gu, ' ').trim();
const DATE_TYPES = new Set(['date', 'month', 'time', 'datetime-local']);
// Option, checkbox, and date values are bounded by the control itself (its option
// list, a boolean, or an ISO format), so verbatim quote grounding is relaxed for
// them; the value is instead coerced to the control's own vocabulary.
function matchOption(options: string[], proposed: string): string | undefined {
  const target = normalizeWhitespace(proposed);
  return options.find(option => normalizeWhitespace(option) === target)
    ?? options.find(option => normalizeWhitespace(option).toLowerCase() === target.toLowerCase());
}
export function validateMapping(raw: string, lines: DocumentLine[], fields: FieldDescriptor[]) {
  if (new TextEncoder().encode(raw).length > LIMITS.responseBytes) throw new MappingError(t('mapTooBig'));
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new MappingError(t('mapInvalidJson')); }
  const parsed = MappingSchema.safeParse(value);
  if (!parsed.success) throw new MappingError(t('mapSchema'));
  const plan = parsed.data, seen = new Set<string>();
  const fieldMap = new Map(fields.map(field => [field.id, field]));
  const lineMap = new Map(lines.map(line => [line.id, line.text]));
  for (const entry of [...plan.assignments, ...plan.unmapped]) {
    if (!fieldMap.has(entry.fieldId) || seen.has(entry.fieldId)) throw new MappingError(t('mapUnknownField'));
    seen.add(entry.fieldId);
  }
  if (seen.size !== fields.length) throw new MappingError(t('mapMissingFields'));
  for (const assignment of plan.assignments) {
    const field = fieldMap.get(assignment.fieldId)!;
    for (const evidence of assignment.evidence) {
      if (!lineMap.get(evidence.lineId)?.includes(evidence.quote)) throw new MappingError(t('mapQuoteMissing'));
    }
    const source = normalizeWhitespace(assignment.evidence.map(item => item.quote).join(' '));
    const proposed = normalizeWhitespace(assignment.value);
    if (field.options?.length) {
      const canonical = matchOption(field.options, proposed);
      if (!canonical) throw new MappingError(t('mapValueNotOption'));
      assignment.value = canonical;
    } else if (field.type === 'checkbox') {
      if (proposed !== 'true') throw new MappingError(t('mapCheckbox'));
      assignment.value = 'true';
    } else if (DATE_TYPES.has(field.type)) {
      if (!proposed) throw new MappingError(t('mapDateEmpty'));
    } else if (!proposed || !source.includes(proposed)) {
      throw new MappingError(t('mapUnsupported'));
    }
    if (field.maxLength >= 0 && assignment.value.length > field.maxLength) throw new MappingError(t('mapTooLong'));
  }
  return plan;
}
