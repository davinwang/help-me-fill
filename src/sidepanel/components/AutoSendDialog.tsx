import { resolveProvider, type ProviderSettings } from '../../ai/registry';
import { t } from '../../shared/i18n';
import { Rich } from './Rich';
// Explicit warning before matching starts sending document text automatically
// to a provider that is not clearly local (cloud or private-LAN endpoint).
export function AutoSendDialog({ settings, onConfirm, onCancel }: { settings: ProviderSettings; onConfirm: () => void; onCancel: () => void }) {
  const name = resolveProvider(settings).name;
  return <div className="modal-backdrop">
    <div className="modal card" role="dialog" aria-modal="true" aria-label={t('autoSendDialogTitle', [name])}>
      <h2>{t('autoSendDialogTitle', [name])}</h2>
      <p><Rich message={t('autoSendDialogBody', [name])} /></p>
      <div className="button-row">
        <button type="button" onClick={onConfirm}>{t('autoSendDialogConfirm')}</button>
        <button type="button" className="secondary" onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  </div>;
}
