import type { Dispatch } from 'react';
import type { Session, Action } from '../session';
export function ReviewTable({ state, dispatch, disabled, onFill }: { state: Session; dispatch: Dispatch<Action>; disabled: boolean; onFill: () => void }) {
  const selected = state.rows.filter(row => row.selected).length;
  const fieldLabel = (id: string) => { const field = state.scan?.fields.find(item => item.id === id); return field?.label || field?.ariaLabel || field?.placeholder || field?.name || 'Unlabeled field'; };
  return <section className="card review">
    <span className="eyebrow">You make the final call</span><h2>Review suggestions</h2>
    <p className="hint">Evidence shows where text came from, not that the match is correct. Select only the values you want to fill.</p>
    <fieldset disabled={disabled}>
      <div className="button-row"><button type="button" className="link-button" onClick={() => dispatch({ type: 'SELECT_ALL', selected: true })}>Select all supported suggestions</button><button type="button" className="link-button" onClick={() => dispatch({ type: 'SELECT_ALL', selected: false })}>Clear selection</button></div>
      {state.rows.map(row => {
        const field = state.scan!.fields.find(item => item.id === row.fieldId)!;
        const needsOverwrite = field.currentValue !== '';
        return <article className={`review-row ${row.selected ? 'selected' : ''}`} key={row.fieldId}>
          <label className="check-label"><input type="checkbox" checked={row.selected} disabled={disabled || (needsOverwrite && !row.allowOverwrite)} onChange={event => dispatch({ type: 'ROW', fieldId: row.fieldId, patch: { selected: event.target.checked } })} />{fieldLabel(row.fieldId)}<span className="subtle">{field.type}</span></label>
          <label className="hint">Proposed value<textarea rows={field.type === 'textarea' ? 3 : 1} value={row.value} maxLength={field.maxLength >= 0 ? Math.min(field.maxLength, 4_000) : 4_000} onChange={event => dispatch({ type: 'ROW', fieldId: row.fieldId, patch: { value: event.target.value, manual: true } })} /></label>
          {row.manual && <span className="badge warning">Manual override · Check carefully</span>}
          {needsOverwrite && <div className="overwrite"><p>Current value: <span className="preserve">{field.currentValue}</span></p><label className="check-label"><input type="checkbox" checked={row.allowOverwrite} onChange={event => dispatch({ type: 'ROW', fieldId: row.fieldId, patch: { allowOverwrite: event.target.checked, selected: false } })} />Allow replacing this existing value</label></div>}
          <details><summary>Source evidence</summary>{row.evidence.map((evidence, index) => <blockquote key={index}><span className="line-tag">{evidence.lineId}</span>{evidence.quote}</blockquote>)}<p className="hint">{row.reason}</p></details>
        </article>;
      })}
      {!state.rows.length && <p>No supported, evidence-backed assignments were returned. The form has not been changed.</p>}
      {!!state.plan?.unmapped.length && <details><summary>{state.plan.unmapped.length} fields left unmapped</summary><ul>{state.plan.unmapped.map(item => <li key={item.fieldId}><strong>{fieldLabel(item.fieldId)}</strong>: {item.reason}</li>)}</ul></details>}
      <p className="notice">Filling can trigger the site's validation, autosave, or network requests. This extension never clicks Submit. Undo cannot reverse server-side effects.</p>
      <button type="button" className="wide" disabled={disabled || !selected} onClick={onFill}>Fill selected ({selected})</button>
    </fieldset>
    {state.metrics && <p className="hint">{state.metrics}</p>}
  </section>;
}
