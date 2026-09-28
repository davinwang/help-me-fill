import { useEffect, useRef, type Dispatch } from 'react';
import type { Session, Action, ReviewRow } from '../session';
import { fillableRows } from '../session';
import { t } from '../../shared/i18n';
export function ReviewTable({ state, dispatch, disabled, onFill }: { state: Session; dispatch: Dispatch<Action>; disabled: boolean; onFill: () => void }) {
  const scan = state.scan;
  // Defensive filter: re-keying keeps rows aligned with the scan, so a row
  // whose field is gone can only appear if that pairing ever failed.
  const rows = scan ? state.rows.filter(row => scan.fields.some(field => field.id === row.fieldId)) : [];
  const fillable = fillableRows(rows);
  const allOn = rows.length > 0 && rows.every(row => row.useAi);
  const mixed = !allOn && rows.some(row => row.useAi);
  // The master checkbox mirrors the rows: all on, all off, or mixed (its
  // indeterminate look is driven by the class, the property is for a11y).
  const master = useRef<HTMLInputElement>(null);
  useEffect(() => { if (master.current) master.current.indeterminate = mixed; }, [mixed]);
  const fieldLabel = (id: string) => { const field = scan?.fields.find(item => item.id === id); return field?.label || field?.ariaLabel || field?.placeholder || field?.name || t('unlabeledField'); };
  return <section className="card review">
    <span className="eyebrow">{t('reviewEyebrow')}</span><h2>{t('reviewTitle')}</h2>
    <p className="hint">{t('reviewHint')}</p>
    <fieldset disabled={disabled}>
      {!!rows.length && <label className="check-label master">
        <input ref={master} type="checkbox" className={`switch ${mixed ? 'mixed' : ''}`} checked={allOn} aria-label={t('toggleAllFields')} onChange={() => dispatch({ type: 'SELECT_ALL', useAi: !allOn })} />
        <span>{t('toggleAllFields')}</span>
      </label>}
      {rows.map(row => {
        const field = scan!.fields.find(item => item.id === row.fieldId)!;
        const label = field.label || field.ariaLabel || field.placeholder || field.name || t('unlabeledField');
        const empty = field.type === 'checkbox' ? field.currentValue !== 'true' : field.currentValue === '';
        const pageValue = field.type === 'checkbox' ? t(field.currentValue === 'true' ? 'checkboxTrue' : 'checkboxFalse') : field.currentValue;
        const set = (patch: Partial<Pick<ReviewRow, 'value' | 'useAi' | 'manual'>>) => dispatch({ type: 'ROW', fieldId: row.fieldId, patch });
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
        return <article className={`review-row ${row.useAi ? 'selected' : ''}`} key={row.fieldId}>
          <div className="section-top">
            <span className="field-name"><strong>{label}</strong> <span className="subtle">{field.type}</span></span>
            <input type="checkbox" className="switch" checked={row.useAi} aria-label={t('useMatchedValue', [label])} onChange={event => set({ useAi: event.target.checked })} />
          </div>
          {row.useAi
            ? <label className="hint">{t('proposedValue')}{editor}
              {!empty && field.currentValue !== row.value && <span className="replace-hint">{t('willBeReplaced', [pageValue])}</span>}
              {row.manual && <span className="badge warning">{t('manualOverride')}</span>}</label>
            : <p className="hint">{t('currentValue')} <span className="preserve">{empty ? t('fieldEmpty') : pageValue}</span></p>}
          <details><summary>{t('sourceEvidence')}</summary>{row.evidence.map((evidence, index) => <blockquote key={index}><span className="line-tag">{evidence.lineId}</span>{evidence.quote}</blockquote>)}<p className="hint">{row.reason}</p></details>
        </article>;
      })}
      {!rows.length && <p>{t('noAssignments')}</p>}
      {!!state.plan?.unmapped.length && <details><summary>{t('unmappedSummary', [String(state.plan.unmapped.length)])}</summary><ul>{state.plan.unmapped.map(item => <li key={item.fieldId}><strong>{fieldLabel(item.fieldId)}</strong>: {item.reason}</li>)}</ul></details>}
      <p className="notice">{t('fillNotice')}</p>
      <button type="button" className="wide" disabled={disabled || !fillable.length} onClick={onFill}>{t('aiHelpMeFill', [String(fillable.length)])}</button>
    </fieldset>
    {state.metrics && <p className="hint">{state.metrics}</p>}
  </section>;
}
