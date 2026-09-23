import { throwIfAborted } from '../shared/errors';
import { finish } from './text';
import type { DocumentLine, ParsedDocument } from './types';

const fence = /^(```|~~~)/;
export function markdownLines(source: string): DocumentLine[] {
  const lines: DocumentLine[] = [];
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    // Markup is presentation, not data: drop headings/list/quote markers and code
    // fences, but keep every value character exactly as written.
    const text = raw.trim().replace(/^#{1,6}\s+/, '').replace(/^>\s?/, '').replace(/^[-*+]\s+/, '').trim();
    if (!text || fence.test(text)) continue;
    lines.push({ id: `p1-l${lines.length + 1}`, page: 1, text });
  }
  return lines;
}
export async function parseMarkdown(file: File, signal: AbortSignal): Promise<ParsedDocument> {
  throwIfAborted(signal);
  const source = await file.text();
  throwIfAborted(signal);
  return finish('markdown', file.name, 1, markdownLines(source));
}
