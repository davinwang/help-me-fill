import type { ParsedDocument } from '../../parsers/types';
import type { BoundScan } from '../../shared/schemas';
import type { ProviderSettings } from '../../ai/registry';
import { resolveProvider } from '../../ai/registry';
import { makePayload, SYSTEM_PROMPT } from '../../ai/prompts';
import { t } from '../../shared/i18n';
import { Rich } from './Rich';
export function DisclosurePreview({ document, scan, settings, disabled, onGenerate }: { document: ParsedDocument; scan: BoundScan; settings?: ProviderSettings; disabled: boolean; onGenerate: () => void }) {
  const resolved = settings ? resolveProvider(settings) : undefined;
  const kind = resolved?.kind;
  const destination = resolved && resolved.endpoint ? new URL(resolved.endpoint).origin : undefined;
  return <section className="card consent">
    <span className="eyebrow">{t('consentEyebrow')}</span><h2>{t('consentTitle')}</h2>
    {kind === 'builtin'
      ? <p><Rich message={t('consentBuiltin')} /></p>
      : kind === 'local'
        ? <p><Rich message={t('consentLocal', [resolved?.name ?? ''])} /></p>
        : <p><Rich message={t('consentCloud', [resolved?.name ?? t('consentProviderFallback')])} /></p>}
    {resolved && <p className="hint">{t('destinationLabel')} {kind === 'builtin' ? t('consentDestinationBuiltin') : destination}<br />{t('modelLabel')} {settings?.model}</p>}
    <details><summary>{t('previewOutgoing')}</summary><pre>{JSON.stringify(makePayload(document.lines, scan.fields), null, 2)}</pre></details>
    <details><summary>{t('viewMappingInstructions')}</summary><pre>{SYSTEM_PROMPT}</pre></details>
    <p className="hint">{kind === 'builtin' ? t('consentAccuracyBuiltin') : kind === 'local' ? t('consentAccuracyLocal') : t('consentAccuracyCloud')} {t('consentRequestsNote')}</p>
    <button className="wide" type="button" disabled={disabled || !settings || !scan.fields.length} onClick={onGenerate}>{kind === 'builtin' ? t('generateBuiltin') : kind === 'local' ? t('generateLocal') : t('generateCloud', [resolved?.name ?? t('generateCloudFallback')])}</button>
    {!settings && <p className="hint">{t('enableProviderToContinue')}</p>}
  </section>;
}
