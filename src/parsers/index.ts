import { LIMITS } from '../shared/schemas';
import { UserError, throwIfAborted } from '../shared/errors';
import type { ParsedDocument } from './types';

export { mergeDocuments } from './merge';

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.xls', '.md', '.markdown', '.txt'] as const;
export type SupportedExtension = typeof SUPPORTED_EXTENSIONS[number];
export function extensionOf(name: string): string {
  return name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
}
export function validateDocumentFile(file: Pick<File, 'name' | 'size' | 'type'>) {
  const extension = extensionOf(file.name);
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new UserError('Choose a PDF, Word (.docx), Excel (.xlsx/.xls), Markdown (.md), or plain text (.txt) file. Legacy .doc and image-only scans are not supported.');
  }
  if (!file.size) throw new UserError('This file is empty.');
  if (file.size > LIMITS.bytes) throw new UserError('Documents must be 10 MiB or smaller. Choose a smaller file.');
}
// All formats converge on the same page/sheet-tagged text lines before any LLM
// call; parsers load lazily so each library stays in its own chunk.
export async function parseDocument(file: File, signal: AbortSignal, onProgress: (page: number, total: number) => void): Promise<ParsedDocument> {
  validateDocumentFile(file);
  throwIfAborted(signal);
  const extension = extensionOf(file.name) as SupportedExtension;
  if (extension === '.pdf') return import('./pdf').then(parser => parser.parsePdf(file, signal, onProgress));
  if (extension === '.docx') return import('./docx').then(parser => parser.parseDocx(file, signal)).then(document => (onProgress(1, 1), document));
  if (extension === '.xlsx' || extension === '.xls') return import('./xlsx').then(parser => parser.parseWorkbook(file, signal)).then(document => (onProgress(1, 1), document));
  if (extension === '.txt') return import('./txt').then(parser => parser.parseText(file, signal)).then(document => (onProgress(1, 1), document));
  return import('./markdown').then(parser => parser.parseMarkdown(file, signal)).then(document => (onProgress(1, 1), document));
}
