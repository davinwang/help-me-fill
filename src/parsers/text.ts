import { LIMITS } from '../shared/schemas';
import { UserError } from '../shared/errors';
import { t } from '../shared/i18n';
import type { DocumentLine, DocumentKind, ParsedDocument } from './types';

export function countCharacters(lines: DocumentLine[]): number {
  return lines.reduce((sum, line) => sum + Array.from(line.text).length, 0);
}
// Every format converges here: the same line contract, the same limits, and the
// same refusal to truncate silently. The LLM only ever sees these text lines.
export function finish(kind: DocumentKind, name: string, pages: number, lines: DocumentLine[]): ParsedDocument {
  if (!lines.length) throw new UserError(t('textNoText'));
  const characters = countCharacters(lines);
  if (characters > LIMITS.characters) throw new UserError(t('textTooMuch'));
  return { kind, name, pages, characters, lines };
}
