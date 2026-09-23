import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';
import { LIMITS } from '../shared/schemas';
import { UserError, throwIfAborted } from '../shared/errors';
import type { DocumentLine, ParsedDocument } from './types';

export function validateFile(file: Pick<File, 'name' | 'size' | 'type'>) {
  if (!/\.pdf$/i.test(file.name) || (file.type && !['application/pdf', 'application/octet-stream'].includes(file.type))) {
    throw new UserError('Choose a valid PDF file. Word, Excel, Markdown, and text files are routed to their own parsers; OCR is not supported.');
  }
  if (!file.size) throw new UserError('This file is empty.');
  if (file.size > LIMITS.bytes) throw new UserError('PDFs must be 10 MiB or smaller. Choose a smaller document.');
}

export function extractLines(items: Array<TextItem | TextMarkedContent>, page: number): DocumentLine[] {
  const lines: DocumentLine[] = [];
  let text = '', last: TextItem | undefined;
  const flush = () => {
    if (text.trim()) lines.push({ id: `p${page}-l${lines.length + 1}`, page, text: text.trim() });
    text = ''; last = undefined;
  };
  for (const item of items) {
    if (!('str' in item)) continue;
    if (last) {
      const lineBreak = Math.abs(item.transform[5] - last.transform[5]) > Math.max(2, Math.abs(last.height) * .55);
      if (lineBreak) flush();
      else {
        const gap = item.transform[4] - (last.transform[4] + last.width);
        if (gap > Math.max(1, Math.abs(last.height) * .15) && text && !/\s$/.test(text) && !/^\s/.test(item.str)) text += ' ';
      }
    }
    text += item.str;
    last = item;
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

export async function parsePdf(file: File, signal: AbortSignal, onProgress: (page: number, total: number) => void): Promise<ParsedDocument> {
  validateFile(file);
  throwIfAborted(signal);
  const bytes = new Uint8Array(await file.arrayBuffer());
  throwIfAborted(signal);
  if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-')) throw new UserError('This file does not contain a valid PDF header.');
  GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf/pdf.worker.min.mjs');
  const task = getDocument({
    data: bytes, useWasm: false,
    cMapUrl: chrome.runtime.getURL('pdf/cmaps/'),
    standardFontDataUrl: chrome.runtime.getURL('pdf/standard_fonts/'),
    verbosity: 0,
  });
  const abort = () => { void task.destroy(); };
  signal.addEventListener('abort', abort, { once: true });
  // Reject explicitly: destroying a password-waiting task alone may leave its promise pending.
  let rejectPassword: (reason: Error) => void = () => {};
  const protectedDocument = new Promise<never>((_resolve, reject) => { rejectPassword = reject; });
  task.onPassword = () => rejectPassword(new UserError('Password-protected PDFs are not supported. Choose an unprotected document.'));
  try {
    const pdf = await Promise.race([task.promise, protectedDocument]);
    if (pdf.numPages > LIMITS.pages) throw new UserError('PDFs may contain at most 20 pages. Choose a shorter document; nothing was truncated.');
    const lines: DocumentLine[] = [];
    let characters = 0;
    for (let page = 1; page <= pdf.numPages; page++) {
      throwIfAborted(signal);
      const pdfPage = await pdf.getPage(page);
      const content = await pdfPage.getTextContent();
      const next = extractLines(content.items, page);
      characters += next.reduce((sum, line) => sum + Array.from(line.text).length, 0);
      if (characters > LIMITS.characters) throw new UserError('Extracted text exceeds 24,000 characters. Choose a shorter PDF; nothing was truncated.');
      lines.push(...next);
      onProgress(page, pdf.numPages);
      pdfPage.cleanup();
    }
    throwIfAborted(signal);
    if (!lines.length) throw new UserError('No extractable text was found. Scanned or image-only PDFs require OCR, which is not included yet.');
    return { kind: 'pdf', name: file.name, pages: pdf.numPages, characters, lines };
  } catch (error) {
    throwIfAborted(signal);
    if (error instanceof UserError) throw error;
    throw new UserError('This PDF could not be read. It may be corrupt, password-protected, or use unsupported encoding.');
  } finally {
    signal.removeEventListener('abort', abort);
    await task.destroy();
  }
}
