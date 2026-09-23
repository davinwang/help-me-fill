import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: { workerSrc: '' }, getDocument: vi.fn() }));
import { getDocument } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { validateFile, extractLines, parsePdf } from '../../src/parsers/pdf';
const item = (str: string, x = 10, y = 100, eol = false): TextItem => ({ str, dir: 'ltr', transform: [12,0,0,12,x,y], width: str.length * 6, height: 12, fontName: 'F1', hasEOL: eol });
const file = () => ({ name: 'sample.pdf', type: 'application/pdf', size: 20, arrayBuffer: async () => new TextEncoder().encode('%PDF-1.7\nmock').buffer } as File);
beforeEach(() => vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => `chrome-extension://test/${path}` } }));
describe('PDF guards and provenance', () => {
  it('rejects non-PDF and oversized/empty files', () => {
    expect(() => validateFile({ name: 'word.docx', size: 10, type: '' })).toThrow('PDF');
    expect(() => validateFile({ name: 'large.pdf', size: 11 * 1024 * 1024, type: 'application/pdf' })).toThrow('10 MiB');
    expect(() => validateFile({ name: 'empty.pdf', size: 0, type: '' })).toThrow('empty');
  });
  it('reconstructs lines with page references and preserves Unicode/zeros', () => {
    const result = extractLines([item('姓名: 陈小明', 10, 100, true), item('Reference:', 10, 80), item('00123', 100, 80, true)], 2);
    expect(result).toEqual([{ id: 'p2-l1', page: 2, text: '姓名: 陈小明' }, { id: 'p2-l2', page: 2, text: 'Reference: 00123' }]);
  });
  it('enforces the page limit and destroys the task', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve({ numPages: 21 }), destroy } as never);
    await expect(parsePdf(file(), new AbortController().signal, () => {})).rejects.toThrow('20 pages'); expect(destroy).toHaveBeenCalled();
  });
  it('rejects no-text PDFs without pretending OCR happened', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [] }), cleanup: vi.fn() }) }), destroy } as never);
    await expect(parsePdf(file(), new AbortController().signal, () => {})).rejects.toThrow('OCR'); expect(destroy).toHaveBeenCalled();
  });
  it('rejects text limits without truncating', async () => {
    vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [item('x'.repeat(24_001))] }), cleanup: vi.fn() }) }), destroy: async () => {} } as never);
    await expect(parsePdf(file(), new AbortController().signal, () => {})).rejects.toThrow('nothing was truncated');
  });
  it('cancels before creating a PDF task', async () => {
    vi.mocked(getDocument).mockClear(); const controller = new AbortController(); controller.abort();
    await expect(parsePdf(file(), controller.signal, () => {})).rejects.toThrow('Canceled'); expect(getDocument).not.toHaveBeenCalled();
  });
  it('rejects password prompts instead of waiting indefinitely', async () => {
    const task = { promise: new Promise(() => {}), destroy: vi.fn().mockResolvedValue(undefined), onPassword: undefined as undefined | (() => void) };
    vi.mocked(getDocument).mockReturnValue(task as never);
    const operation = parsePdf(file(), new AbortController().signal, () => {});
    await Promise.resolve(); task.onPassword?.();
    await expect(operation).rejects.toThrow('Password-protected'); expect(task.destroy).toHaveBeenCalled();
  });
});
