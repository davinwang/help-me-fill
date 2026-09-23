import { LIMITS } from '../shared/schemas';
import { UserError } from '../shared/errors';
import type { DocumentLine, ParsedDocument } from './types';

// Multiple uploads stay separate cards in the UI but converge on one bounded
// line array for the provider call. Line IDs are prefixed per document so
// evidence citations stay unique and traceable; text is never rewritten.
export function mergeDocuments(documents: ParsedDocument[]): ParsedDocument {
  if (documents.length === 1) return documents[0];
  const lines: DocumentLine[] = [];
  documents.forEach((document, index) => {
    for (const line of document.lines) lines.push({ ...line, id: `d${index + 1}-${line.id}` });
  });
  const characters = lines.reduce((sum, line) => sum + Array.from(line.text).length, 0);
  if (characters > LIMITS.characters) throw new UserError('Combined extracted text exceeds 24,000 characters. Remove a document; nothing was truncated.');
  return {
    kind: 'mixed',
    name: `${documents.length} documents`,
    pages: documents.reduce((sum, document) => sum + document.pages, 0),
    characters,
    lines,
  };
}
