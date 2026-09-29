import type { ParsedDocument } from '../../parsers/types';
import { t } from '../../shared/i18n';
const unitKeys = { pdf: 'unitPages', docx: 'unitPages', xlsx: 'unitSheets', markdown: 'unitPages', txt: 'unitPages', mixed: 'unitParts' } as const;
// Pastel file-type chips reuse the badge palette so each icon reads as a label
// rather than a decoration.
const KINDS: Record<ParsedDocument['kind'], { label: string; color: string; tint: string }> = {
  pdf: { label: 'PDF', color: '#d92d20', tint: '#fdeceb' },
  docx: { label: 'DOC', color: '#2f5fd0', tint: '#e9effb' },
  xlsx: { label: 'XLS', color: '#157f52', tint: '#e4f4eb' },
  markdown: { label: 'MD', color: '#6d4fc2', tint: '#efecfa' },
  txt: { label: 'TXT', color: '#5f6673', tint: '#edeff2' },
  mixed: { label: 'MIX', color: '#9a6a1b', tint: '#fbf2de' },
};
function KindIcon({ kind }: { kind: ParsedDocument['kind'] }) {
  const { label, color, tint } = KINDS[kind];
  return <svg className="kind-icon" width="27" height="17" viewBox="0 0 27 17" aria-hidden="true">
    <rect width="27" height="17" rx="4" fill={tint} />
    <text x="13.5" y="8.5" dominantBaseline="central" textAnchor="middle" fontSize="7" fontWeight="700" letterSpacing=".4" fill={color}>{label}</text>
  </svg>;
}
// Single-row card: the whole summary toggles the parsed details, so the parsed
// badge doubles as the disclosure control instead of a separate details row.
export function DocumentPreview({ document, disabled, onRemove }: { document: ParsedDocument; disabled: boolean; onRemove: () => void }) {
  return <details className="card doc-card">
    <summary className="section-top">
      <KindIcon kind={document.kind} />
      <h2 className="filename">{document.name}</h2>
      <span className="badge" title={t('details')}>{t('parsed')}</span>
      <button type="button" className="icon-button danger" aria-label={t('removeDocument', [document.name])} data-tooltip={t('delete')} disabled={disabled} onClick={onRemove}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
      </button>
    </summary>
    <p className="hint">{t('docMeta', [document.kind.toUpperCase(), document.pages, t(unitKeys[document.kind]), document.characters.toLocaleString()])}</p>
    <div className="text-preview">{document.lines.map(line => <p key={line.id}><span className="line-tag">{line.id}</span>{line.text}</p>)}</div>
  </details>;
}
