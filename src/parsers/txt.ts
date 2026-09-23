import { throwIfAborted } from '../shared/errors';
import { finish } from './text';
import type { DocumentLine, ParsedDocument } from './types';

export function textLines(source: string): DocumentLine[] {
  return source.split(/\r\n?|\n/)
    .map(line => line.replace(/\s+$/, ''))
    .filter(line => line !== '')
    .map((text, index) => ({ id: `p1-l${index + 1}`, page: 1, text }));
}
export async function parseText(file: File, signal: AbortSignal): Promise<ParsedDocument> {
  throwIfAborted(signal);
  const source = await file.text();
  throwIfAborted(signal);
  return finish('txt', file.name, 1, textLines(source));
}
