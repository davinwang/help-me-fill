import { PDFDocument, PDFName } from 'pdf-lib';
import { Document, Packer, Paragraph } from 'docx';
import XLSX from 'xlsx';
import { mkdir, writeFile } from 'node:fs/promises';
import { benchmarkCases } from '../tests/fixtures/cases.ts';
const output = 'tests/fixtures/generated';
await mkdir(output, { recursive: true });

async function makePdf(lines, pages = 1) {
  const document = await PDFDocument.create();
  const ctx = document.context;
  const descriptor = ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: 'STSong-Light', Flags: 4, FontBBox: [0, -200, 1000, 900], ItalicAngle: 0, Ascent: 880, Descent: -120, CapHeight: 700, StemV: 80 }));
  const descendant = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'CIDFontType0', BaseFont: 'STSong-Light', CIDSystemInfo: { Registry: 'Adobe', Ordering: 'GB1', Supplement: 4 }, FontDescriptor: descriptor, DW: 1000 }));
  const toUnicode = ctx.register(ctx.stream('/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <ffff>\nendcodespacerange\n1 beginbfrange\n<0000> <ffff> <0000>\nendbfrange\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend'));
  const font = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: 'STSong-Light', Encoding: 'UniGB-UCS2-H', DescendantFonts: [descendant], ToUnicode: toUnicode }));
  for (let index = 0; index < pages; index++) {
    const page = document.addPage([612, 792]);
    page.node.set(PDFName.of('Resources'), ctx.obj({ Font: { F1: font } }));
    const commands = lines.map((line, i) => {
      const hex = line.split('').map(character => character.charCodeAt(0).toString(16).padStart(4, '0')).join('');
      return `BT /F1 8 Tf 1 0 0 1 30 ${760 - i * 28} Tm <${hex}> Tj ET`;
    }).join('\n');
    page.node.set(PDFName.of('Contents'), ctx.register(ctx.stream(commands)));
  }
  return document.save();
}
for (const scenario of benchmarkCases) {
  await writeFile(`${output}/${scenario.id}.pdf`, await makePdf(scenario.lines));
  // Same facts in every supported format, so extraction can be compared per kind.
  await writeFile(`${output}/${scenario.id}.docx`, await Packer.toBuffer(new Document({ sections: [{ children: scenario.lines.map(line => new Paragraph(line)) }] })));
  const book = XLSX.utils.book_new();
  const rows = scenario.lines.map(line => { const [first, ...rest] = line.split(': '); return rest.length ? [first, rest.join(': ')] : [line]; });
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  await writeFile(`${output}/${scenario.id}.xlsx`, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  await writeFile(`${output}/${scenario.id}.md`, `# ${scenario.title}\n\n${scenario.lines.map(line => `- ${line}`).join('\n')}\n`);
await writeFile(`${output}/${scenario.id}.txt`, `${scenario.lines.join('\n')}\n`);
}
await writeFile(`${output}/no-text.pdf`, await makePdf([]));
await writeFile(`${output}/too-many-pages.pdf`, await makePdf(['Synthetic page'], 21));
// Keep every glyph on the page; PDF.js ignores text outside the page bounds.
await writeFile(`${output}/too-much-text.pdf`, await makePdf(Array.from({ length: 20 }, () => 'X'.repeat(61)), 20));
await writeFile(`${output}/corrupt.pdf`, '%PDF-1.7\nnot a valid object structure');
await writeFile(`${output}/too-large.pdf`, Buffer.alloc(10 * 1024 * 1024 + 1));
await writeFile(`${output}/empty.pdf`, Buffer.alloc(0));
await writeFile(`${output}/wrong-header.pdf`, 'This is not a PDF.');
await writeFile(`${output}/legacy.doc`, 'Legacy binary Word placeholder; the dispatcher must reject .doc by extension.');
console.log(`Generated ${benchmarkCases.length} synthetic bilingual cases in PDF/DOCX/XLSX/Markdown/TXT plus eight failure fixtures. No personal data used.`);
