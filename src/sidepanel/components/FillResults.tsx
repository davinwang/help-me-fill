import type { BoundScan, OperationResult } from '../../shared/schemas';
import { t } from '../../shared/i18n';
// Statuses are stable machine tokens in the result payload; map each to a
// localized label for display without changing the wire values.
const STATUS_KEYS: Record<string, string> = {
  filled: 'statusFilled', restored: 'statusRestored', skipped: 'statusSkipped',
  failed: 'statusFailed', 'changed/reverted': 'statusChangedReverted',
};
export function FillResults({ result, scan, disabled, onUndo }: { result: OperationResult; scan: BoundScan; disabled: boolean; onUndo: () => void }) {
  return <section className="card" aria-label={t('fillResultsLabel')}>
    <h2>{t('operationResults')}</h2><p className="hint">{t('resultsHint')}</p>
    <ul className="results">{result.results.map((item, index) => {
      const field = scan.fields.find(field => field.id === item.fieldId);
      return <li key={index}><div className="section-top"><strong>{field?.label || field?.ariaLabel || field?.name || t('fieldFallback')}</strong><span className={`badge ${item.status === 'filled' || item.status === 'restored' ? '' : 'warning'}`}>{t(STATUS_KEYS[item.status] ?? item.status)}</span></div><p className="hint">{item.detail}</p></li>;
    })}</ul>
    <button type="button" className="secondary wide" disabled={disabled || !result.canUndo} onClick={onUndo}>{t('undoLastFill')}</button>
    <p className="hint">{t('undoHint')}</p>
  </section>;
}
