import type { BoundScan } from '../../shared/schemas';
import { t } from '../../shared/i18n';
// Read-only view of what the extension detected on the page, shown while the
// user is still choosing documents. Values are the page's current values, kept
// fresh by the quiet re-detection loop.
export function PageFields({ scan }: { scan: BoundScan }) {
  return <section className="card fields" aria-label={t('fieldsTitle', [String(scan.fields.length)])}>
    <span className="eyebrow">{t('fieldsEyebrow')}</span>
    <h2>{t('fieldsTitle', [String(scan.fields.length)])}</h2>
    <p className="hint">{t('fieldsHint')}</p>
    <ul className="field-list">
      {scan.fields.map(field => {
        const label = field.label || field.ariaLabel || field.placeholder || field.name || t('unlabeledField');
        const empty = field.type === 'checkbox' ? field.currentValue !== 'true' : field.currentValue === '';
        const value = field.type === 'checkbox' ? t(field.currentValue === 'true' ? 'checkboxTrue' : 'checkboxFalse') : field.currentValue;
        return <li key={field.id}>
          <div className="section-top"><strong>{label}</strong><span className="subtle">{field.type}</span></div>
          <p className={empty ? 'hint' : ''}>{empty ? t('fieldEmpty') : value}</p>
        </li>;
      })}
    </ul>
  </section>;
}
