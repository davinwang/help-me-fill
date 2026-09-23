import type { ParsedDocument } from '../../parsers/types';
const units = { pdf: 'pages', docx: 'pages', xlsx: 'sheets', markdown: 'pages', txt: 'pages', mixed: 'parts' } as const;
// Compact per-document card: name, parsed badge, and trash icon stay visible;
// everything else collapses behind the details toggle.
export function DocumentPreview({ document, disabled, onRemove }: { document: ParsedDocument; disabled: boolean; onRemove: () => void }) {
  return <section className="card doc-card">
    <div className="section-top">
      <h2 className="filename">{document.name}</h2>
      <span className="badge">Parsed</span>
      <button type="button" className="icon-button danger" aria-label={`Remove ${document.name}`} data-tooltip="Delete" disabled={disabled} onClick={onRemove}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
      </button>
    </div>
    <details><summary>Details</summary>
      <p className="hint">{document.kind.toUpperCase()} · {document.pages} {units[document.kind]} · {document.characters.toLocaleString()} characters · Check reading order and source accuracy.</p>
      <div className="text-preview">{document.lines.map(line => <p key={line.id}><span className="line-tag">{line.id}</span>{line.text}</p>)}</div>
    </details>
  </section>;
}
