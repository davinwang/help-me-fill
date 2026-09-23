import type { BoundScan, OperationResult } from '../../shared/schemas';
export function FillResults({ result, scan, disabled, onUndo }: { result: OperationResult; scan: BoundScan; disabled: boolean; onUndo: () => void }) {
  return <section className="card" aria-label="Fill results">
    <h2>Operation results</h2><p className="hint">Verified on this page, not confirmed by the server. Rescan before another fill.</p>
    <ul className="results">{result.results.map((item, index) => {
      const field = scan.fields.find(field => field.id === item.fieldId);
      return <li key={index}><div className="section-top"><strong>{field?.label || field?.ariaLabel || field?.name || 'Field'}</strong><span className={`badge ${item.status === 'filled' || item.status === 'restored' ? '' : 'warning'}`}>{item.status}</span></div><p className="hint">{item.detail}</p></li>;
    })}</ul>
    <button type="button" className="secondary wide" disabled={disabled || !result.canUndo} onClick={onUndo}>Undo last fill</button>
    <p className="hint">Undo preserves later edits and cannot reverse autosave or other page-side effects. Resetting or rescanning clears undo.</p>
  </section>;
}
