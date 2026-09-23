import * as XLSX from 'xlsx';
import { LIMITS } from '../shared/schemas';
import { throwIfAborted, UserError } from '../shared/errors';
import { finish } from './text';
import type { DocumentLine, ParsedDocument } from './types';

export async function parseWorkbook(file: File, signal: AbortSignal): Promise<ParsedDocument> {
  throwIfAborted(signal);
  const data = new Uint8Array(await file.arrayBuffer());
  throwIfAborted(signal);
  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(data, { dense: true });
  } catch {
    throw new UserError('This spreadsheet could not be read. Re-export it as .xlsx and try again.');
  }
  // Provenance over flattening: every line keeps its sheet and row, and cells of a
  // row stay together instead of becoming unqualified CSV.
  const visible = book.SheetNames.filter((name, index) => !book.Workbook?.Sheets?.[index]?.Hidden);
  if (!visible.length) throw new UserError('This workbook has no visible sheets.');
  if (visible.length > LIMITS.pages) throw new UserError(`Workbooks may contain at most ${LIMITS.pages} visible sheets. Choose a smaller workbook; nothing was truncated.`);
  const lines: DocumentLine[] = [];
  visible.forEach((name, sheet) => {
    // raw:false keeps displayed text, so leading zeros and identifiers survive.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, raw: false, defval: '' });
    const pageLines: DocumentLine[] = [];
    rows.forEach((row, index) => {
      const cells = row.map(cell => String(cell ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
      if (cells.length) pageLines.push({ id: `p${sheet + 1}-l${pageLines.length + 1}`, page: sheet + 1, text: `[${name}] r${index + 1}: ${cells.join(' | ')}` });
    });
    lines.push(...pageLines);
  });
  throwIfAborted(signal);
  return finish('xlsx', file.name, visible.length, lines);
}
