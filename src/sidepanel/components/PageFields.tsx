import { useEffect, useRef, type Dispatch } from 'react';
import type { Action, ReviewRow, Session } from '../session';
import { fillableRows } from '../session';
import { t } from '../../shared/i18n';
// One compact list for the whole workflow. Before matching it shows the page's
// current values; once a plan arrives, matched rows grow a switch, the proposed
// value, and their evidence in place — the same list updates instead of being
// replaced by a separate review card.
export function PageFields({ state, dispatch, disabled, onFill }: { state: Session; dispatch: Dispatch<Action>; disabled: boolean; onFill: () => void }) {
  const scan = state.scan!;
  const plan = state.plan;
  // Defensive filter: re-keying keeps rows aligned with the scan, so a row
  // whose field is gone can only appear if that pairing ever failed.
  const rows = plan ? state.rows.filter(row => scan.fields.some(field => field.id === row.fieldId)) : [];
  const fillable = fillableRows(rows);
  const allOn = rows.length > 0 && rows.every(row => row.useAi);
  const mixed = !allOn && rows.some(row => row.useAi);
  // The master checkbox mirrors the rows: all on, all off, or mixed (its
  // indeterminate look is driven by the class, the property is for a11y).
  const master = useRef<HTMLInputElement>(null);
  useEffect(() => { if (master.current) master.current.indeterminate = mixed; }, [mixed]);
  const set = (fieldId: string, patch: Partial<Pick<ReviewRow, 'value' | 'useAi' | 'manual'>>) => dispatch({ type: 'ROW', fieldId, patch });
  return <section className="card fields" aria-label={t('fieldsTitle', [String(scan.fields.length)])}>
    <span className="eyebrow">{t('fieldsEyebrow')}</span>
    <h2>{t('fieldsTitle', [String(scan.fields.length)])}</h2>
    <p className="hint">{plan ? t('reviewHint') : t('fieldsHint')}</p>
    <fieldset disabled={disabled}>
      {plan && !!rows.length && <label className="check-label master">
        <input ref={master} type="checkbox" className={`switch ${mixed ? 'mixed' : ''}`} checked={allOn} aria-label={t('toggleAllFields')} onChange={() => dispatch({ type: 'SELECT_ALL', useAi: !allOn })} />
        <span>{t('toggleAllFields')}</span>
      </label>}
      <ul className="field-list">
        {scan.fields.map(field => {
          const label = field.label || field.ariaLabel || field.placeholder || field.name || t('unlabeledField');
          const row = rows.find(item => item.fieldId === field.id);
          const unmapped = plan?.unmapped.find(item => item.fieldId === field.id);
          const empty = field.type === 'checkbox' ? field.currentValue !== 'true' : field.currentValue === '';
          const pageValue = field.type === 'checkbox' ? t(field.currentValue === 'true' ? 'checkboxTrue' : 'checkboxFalse') : field.currentValue;
          return <li key={field.id}>
            <div className="section-top">
              <span className="field-name"><strong>{label}</strong> <span className="subtle">{field.type}</span></span>
              {row && <input type="checkbox" className="switch" checked={row.useAi} aria-label={t('useMatchedValue', [label])} onChange={event => set(row.fieldId, { useAi: event.target.checked })} />}
            </div>
            {row?.useAi
              ? <>
                {field.type === 'select'
                  ? <select value={row.value} aria-label={`${t('proposedValue')}: ${label}`} onChange={event => set(row.fieldId, { value: event.target.value, manual: true })}>
                    {!field.options?.includes(row.value) && <option value={row.value}>{row.value || t('chooseOption')}</option>}
                    {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                  : field.type === 'checkbox'
                    ? <select value={row.value} aria-label={`${t('proposedValue')}: ${label}`} onChange={event => set(row.fieldId, { value: event.target.value, manual: true })}>
                      <option value="true">{t('checkboxTrue')}</option>
                      <option value="false">{t('checkboxFalse')}</option>
                    </select>
                    : ['date', 'month', 'time', 'datetime-local'].includes(field.type)
                      ? <input type={field.type} value={row.value} aria-label={`${t('proposedValue')}: ${label}`} onChange={event => set(row.fieldId, { value: event.target.value, manual: true })} />
                      : <textarea rows={field.type === 'textarea' || field.type === 'richtext' ? 3 : 1} value={row.value} aria-label={`${t('proposedValue')}: ${label}`} maxLength={field.maxLength >= 0 ? Math.min(field.maxLength, 4_000) : 4_000} onChange={event => set(row.fieldId, { value: event.target.value, manual: true })} />}
                {!empty && field.currentValue !== row.value && <span className="replace-hint">{t('willBeReplaced', [pageValue])}</span>}
                {row.manual && <span className="badge warning">{t('manualOverride')}</span>}
              </>
              : <p className={empty ? 'hint' : ''}>{empty ? t('fieldEmpty') : pageValue}</p>}
            {row && <details><summary>{t('sourceEvidence')}</summary>{row.evidence.map((evidence, index) => <blockquote key={index}><span className="line-tag">{evidence.lineId}</span>{evidence.quote}</blockquote>)}<p className="hint">{row.reason}</p></details>}
            {!row && unmapped && <p className="hint unmatched">{t('unmatchedReason', [unmapped.reason])}</p>}
          </li>;
        })}
      </ul>
      {plan && !rows.length && <p>{t('noAssignments')}</p>}
      {plan && <p className="notice">{t('fillNotice')}</p>}
      {plan && <button type="button" className="wide" disabled={disabled || !fillable.length} onClick={onFill}>{t('aiHelpMeFill', [String(fillable.length)])}</button>}
    </fieldset>
    {plan && state.metrics && <p className="hint">{state.metrics}</p>}
  </section>;
}
