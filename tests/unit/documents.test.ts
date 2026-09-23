import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph } from 'docx';
import { parseDocument, validateDocumentFile, mergeDocuments } from '../../src/parsers';
import { markdownLines } from '../../src/parsers/markdown';
import { textLines } from '../../src/parsers/txt';
import { parseWorkbook } from '../../src/parsers/xlsx';
import { parseDocx } from '../../src/parsers/docx';
import { sessionReducer, initialSession } from '../../src/sidepanel/session';
import type { ParsedDocument } from '../../src/parsers/types';

const signal = () => new AbortController().signal;
const file = (name: string, parts: BlobPart[], type = '') => new File(parts, name, { type });
describe('markdown', () => {
  it('strips markup but preserves values, Unicode, and leading zeros', () => {
    const lines = markdownLines('# Applicant\r\n\r\n- Name: 陈小明\r\n> Reference: 000123\r\n```\r\nfence\r\n```\r\n');
    expect(lines).toEqual([
      { id: 'p1-l1', page: 1, text: 'Applicant' },
      { id: 'p1-l2', page: 1, text: 'Name: 陈小明' },
      { id: 'p1-l3', page: 1, text: 'Reference: 000123' },
      { id: 'p1-l4', page: 1, text: 'fence' },
    ]);
  });
  it('parses files through the dispatcher and rejects empty content', async () => {
    const parsed = await parseDocument(file('notes.md', ['# Facts\n', 'Phone: +1 202 555 0103\n']), signal(), () => {});
    expect(parsed.kind).toBe('markdown'); expect(parsed.lines[1].text).toBe('Phone: +1 202 555 0103');
    await expect(parseDocument(file('empty.md', ['\n\n']), signal(), () => {})).rejects.toThrow('No extractable text');
  });
  it('refuses oversized text without truncating', async () => {
    await expect(parseDocument(file('big.md', ['x'.repeat(24_001)]), signal(), () => {})).rejects.toThrow('nothing was truncated');
  });
});
describe('xlsx provenance', () => {
  function workbook() {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Applicant', '陈小明'], ['Reference', '000123'], [], ['Solo']]), 'Sheet1');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Hidden']]), 'Secret');
    book.Workbook = { Sheets: [{}, { Hidden: 1 }] };
    return XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  }
  it('keeps sheet and row provenance, joins row cells, skips hidden sheets', async () => {
    const parsed = await parseWorkbook(file('book.xlsx', [workbook()]), signal());
    expect(parsed.kind).toBe('xlsx'); expect(parsed.pages).toBe(1);
    expect(parsed.lines.map(line => line.text)).toEqual([
      '[Sheet1] r1: Applicant | 陈小明',
      '[Sheet1] r2: Reference | 000123',
      '[Sheet1] r4: Solo',
    ]);
    expect(parsed.lines[0].id).toBe('p1-l1');
  });
  it('rejects unreadable spreadsheets', async () => {
    const truncatedZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(48).fill(0xff)]);
    await expect(parseWorkbook(file('bad.xlsx', [truncatedZip]), signal())).rejects.toThrow('spreadsheet');
  });
});
describe('docx', () => {
  it('extracts paragraph text unchanged', async () => {
    const buffer = new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('姓名: 陈小明'), new Paragraph('Reference: 000123')] }] })));
    const parsed = await parseDocx(file('form.docx', [buffer]), signal());
    expect(parsed.kind).toBe('docx');
    expect(parsed.lines.map(line => line.text)).toEqual(['姓名: 陈小明', 'Reference: 000123']);
  });
  it('rejects corrupt word files', async () => {
    await expect(parseDocx(file('bad.docx', ['zip? no']), signal())).rejects.toThrow('Word');
  });
});
describe('plain text', () => {
  it('keeps line content verbatim, dropping only blank lines and trailing whitespace', () => {
    expect(textLines('Name: 陈小明\r\n\r\nReference: 000123  \r\n')).toEqual([
      { id: 'p1-l1', page: 1, text: 'Name: 陈小明' },
      { id: 'p1-l2', page: 1, text: 'Reference: 000123' },
    ]);
  });
  it('parses .txt through the dispatcher and rejects empty content', async () => {
    const parsed = await parseDocument(file('notes.txt', ['Phone: +1 202 555 0103\n']), signal(), () => {});
    expect(parsed.kind).toBe('txt'); expect(parsed.lines[0].text).toBe('Phone: +1 202 555 0103');
    await expect(parseDocument(file('empty.txt', ['\n\n']), signal(), () => {})).rejects.toThrow('No extractable text');
  });
});
describe('multi-document sessions', () => {
  const doc = (name: string, text: string, characters = text.length): ParsedDocument => ({ kind: 'txt', name, pages: 1, characters, lines: [{ id: 'p1-l1', page: 1, text }] });
  it('merges line IDs with per-document prefixes and leaves text untouched', () => {
    const merged = mergeDocuments([doc('a.txt', 'Name: 陈小明'), doc('b.txt', 'Reference: 000123')]);
    expect(merged.kind).toBe('mixed'); expect(merged.name).toBe('2 documents');
    expect(merged.lines).toEqual([
      { id: 'd1-p1-l1', page: 1, text: 'Name: 陈小明' },
      { id: 'd2-p1-l1', page: 1, text: 'Reference: 000123' },
    ]);
    expect(mergeDocuments([doc('solo.txt', 'Solo')]).name).toBe('solo.txt');
  });
  it('refuses a combined text total above the shared limit', () => {
    expect(() => mergeDocuments([doc('a.txt', 'x'.repeat(20_000)), doc('b.txt', 'y'.repeat(5_000))])).toThrow('Combined extracted text exceeds 24,000 characters');
  });
  it('keeps every parsed document until it is deleted, and drops stale plans on any change', () => {
    let state = sessionReducer(initialSession, { type: 'DOCUMENT', document: doc('a.txt', 'A') });
    state = sessionReducer(state, { type: 'DOCUMENT', document: doc('b.txt', 'B') });
    expect(state.documents.map(document => document.name)).toEqual(['a.txt', 'b.txt']);
    expect(state.stage).toBe('documents');
    state = sessionReducer(state, { type: 'REMOVE_DOCUMENT', index: 0 });
    expect(state.documents.map(document => document.name)).toEqual(['b.txt']);
    state = sessionReducer(state, { type: 'DOCUMENT', document: doc('c.txt', 'C') });
    expect(state.documents.map(document => document.name)).toEqual(['b.txt', 'c.txt']);
  });
});
describe('dispatcher guards', () => {
  it('accepts the supported families and rejects legacy or unknown types', () => {
    for (const name of ['a.pdf', 'a.docx', 'a.xlsx', 'a.xls', 'a.md', 'a.markdown', 'a.txt']) expect(() => validateDocumentFile({ name, size: 10, type: '' })).not.toThrow();
    expect(() => validateDocumentFile({ name: 'legacy.doc', size: 10, type: '' })).toThrow('Legacy .doc');
    expect(() => validateDocumentFile({ name: 'notes.rtf', size: 10, type: '' })).toThrow('plain text (.txt)');
    expect(() => validateDocumentFile({ name: 'a.md', size: 0, type: '' })).toThrow('empty');
    expect(() => validateDocumentFile({ name: 'a.pdf', size: 11 * 1024 * 1024, type: '' })).toThrow('10 MiB');
  });
  it('routes every supported family to the same line contract', async () => {
    const buffer = new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Name: Avery Morgan')] }] })));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Name', 'Avery Morgan']]), 'Sheet1');
    const sheet = new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }));
    const cases: Array<[string, BlobPart[]]> = [['f.docx', [buffer]], ['f.xlsx', [sheet]], ['f.md', ['Name: Avery Morgan']]];
    for (const [name, parts] of cases) {
      const parsed = await parseDocument(file(name, parts), signal(), () => {});
      expect(parsed.lines).toHaveLength(1);
      expect(parsed.lines[0].text).toContain('Avery Morgan');
    }
  });
});
