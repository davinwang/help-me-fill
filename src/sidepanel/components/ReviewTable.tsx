import type { Dispatch } from 'react';
import type { Session, Action } from '../session';
import { t } from '../../shared/i18n';
export function ReviewTable({ state, dispatch, disabled, onFill }: { state: Session; dispatch: Dispatch<Action>; disabled: boolean; onFill: () => void }) {
  const selected = state.rows.filter(row => row.selected).length;
  const fieldLabel = (id: string) => { const field = state.scan?.fields.find(item => item.id === id); return field?.label || field?.ariaLabel || field?.placeholder || field?.name || t('unlabeledField'); };
  return <section className="card review">
    <span className="eyebrow">{t('reviewEyebrow')}</span><h2>{t('reviewTitle')}</h2>
    <p className="hint">{t('reviewHint')}</p>
    <fieldset disabled={disabled}>
      <div className="button-row"><button type="button" className="link-button" onClick={() => dispatch({ type: 'SELECT_ALL', selected: true })}>{t('selectAll')}</button><button type="button" className="link-button" onClick={() => dispatch({ type: 'SELECT_ALL', selected: false })}>{t('clearSelection')}</button></div>
      {state.rows.map(row => {
        const field = state.scan!.fields.find(item => item.id === row.fieldId)!;
        const needsOverwrite = field.type === 'checkbox' ? field.currentValue === 'true' : field.currentValue !== '';
        const set = (patch: Partial<typeof row>) => dispatch({ type: 'ROW', fieldId: row.fieldId, patch });
        const editor = field.type === 'select'
          ? <select value={row.value} onChange={event => set({ value: event.target.value, manual: true })}>
            {!field.options?.includes(row.value) && <option value={row.value}>{row.value || t('chooseOption')}</option>}
            {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
          : field.type === 'checkbox'
            ? <select value={row.value} onChange={event => set({ value: event.target.value, manual: true })}>
              <option value="true">{t('checkboxTrue')}</option>
              <option value="false">{t('checkboxFalse')}</option>
            </select>
            : ['date', 'month', 'time', 'datetime-local'].includes(field.type)
              ? <input type={field.type} value={row.value} onChange={event => set({ value: event.target.value, manual: true })} />
              : <textarea rows={field.type === 'textarea' || field.type === 'richtext' ? 3 : 1} value={row.value} maxLength={field.maxLength >= 0 ? Math.min(field.maxLength, 4_000) : 4_000} onChange={event => set({ value: event.target.value, manual: true })} />;
        return <article className={`review-row ${row.selected ? 'selected' : ''}`} key={row.fieldId}>
          <label className="check-label"><input type="checkbox" checked={row.selected} disabled={disabled || (needsOverwrite && !row.allowOverwrite)} onChange={event => dispatch({ type: 'ROW', fieldId: row.fieldId, patch: { selected: event.target.checked } })} />{fieldLabel(row.fieldId)}<span className="subtle">{field.type}</span></label>
          <label className="hint">{t('proposedValue')}{editor}</label>
          {row.manual && <span className="badge warning">{t('manualOverride')}</span>}
          {needsOverwrite && <div className="overwrite"><p>{t('currentValue')} <span className="preserve">{field.currentValue}</span></p><label className="check-label"><input type="checkbox" checked={row.allowOverwrite} onChange={event => dispatch({ type: 'ROW', fieldId: row.fieldId, patch: { allowOverwrite: event.target.checked, selected: false } })} />{t('allowOverwrite')}</label></div>}
          <details><summary>{t('sourceEvidence')}</summary>{row.evidence.map((evidence, index) => <blockquote key={index}><span className="line-tag">{evidence.lineId}</span>{evidence.quote}</blockquote>)}<p className="hint">{row.reason}</p></details>
        </article>;
      })}
      {!state.rows.length && <p>{t('noAssignments')}</p>}
      {!!state.plan?.unmapped.length && <details><summary>{t('unmappedSummary', [state.plan.unmapped.length])}</summary><ul>{state.plan.unmapped.map(item => <li key={item.fieldId}><strong>{fieldLabel(item.fieldId)}</strong>: {item.reason}</li>)}</ul></details>}
      <p className="notice">{t('fillNotice')}</p>
      <button type="button" className="wide" disabled={disabled || !selected} onClick={onFill}>{t('fillSelected', [selected])}</button>
    </fieldset>
    {state.metrics && <p className="hint">{state.metrics}</p>}
  </section>;
}
