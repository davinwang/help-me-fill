import mammoth from 'mammoth/mammoth.browser.min.js';
import { throwIfAborted, UserError } from '../shared/errors';
import { finish } from './text';
import type { DocumentLine, ParsedDocument } from './types';

export async function parseDocx(file: File, signal: AbortSignal): Promise<ParsedDocument> {
  throwIfAborted(signal);
  const arrayBuffer = await file.arrayBuffer();
  throwIfAborted(signal);
  let value: string;
  try {
    value = (await mammoth.extractRawText({ arrayBuffer })).value;
  } catch {
    throw new UserError('This Word file could not be read. Re-export it as .docx and try again.');
  }
  throwIfAborted(signal);
  const lines: DocumentLine[] = value.split(/\r?\n/g).map(line => line.trim()).filter(Boolean)
    .map((text, index) => ({ id: `p1-l${index + 1}`, page: 1, text }));
  return finish('docx', file.name, 1, lines);
}
