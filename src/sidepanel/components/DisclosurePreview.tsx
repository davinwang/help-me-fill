import type { ParsedDocument } from '../../parsers/types';
import type { BoundScan } from '../../shared/schemas';
import type { ProviderSettings } from '../../ai/registry';
import { PROVIDERS, BUILTIN } from '../../ai/registry';
import { makePayload, SYSTEM_PROMPT } from '../../ai/prompts';
export function DisclosurePreview({ document, scan, settings, disabled, onGenerate }: { document: ParsedDocument; scan: BoundScan; settings?: ProviderSettings; disabled: boolean; onGenerate: () => void }) {
  const builtin = settings?.provider === 'builtin';
  const provider = settings ? (settings.provider === 'builtin' ? BUILTIN : PROVIDERS[settings.provider]) : undefined;
  return <section className="card consent">
    <span className="eyebrow">Before anything leaves your browser</span><h2>Review what you share</h2>
    {builtin
      ? <p>Generating suggestions is handled by your browser's <strong>on-device model</strong>. Extracted document text and selected form metadata never leave this device. Original files and existing field values are not used.</p>
      : <p>Generating suggestions sends extracted document text and selected form metadata to <strong>{provider?.name ?? 'your selected provider'}</strong>. Original files and existing field values are not sent.</p>}
    {provider && <p className="hint">Destination: {builtin ? 'On-device model (no network request)' : new URL(provider.endpoint).origin}<br />Model: {settings?.model}</p>}
    <details><summary>Preview outgoing data</summary><pre>{JSON.stringify(makePayload(document.lines, scan.fields), null, 2)}</pre></details>
    <details><summary>View mapping instructions</summary><pre>{SYSTEM_PROMPT}</pre></details>
    <p className="hint">{builtin ? 'On-device accuracy is experimental; every suggestion still needs your review. ' : "Your provider's retention policy and API charges apply. "}One request plus at most one validation-repair request may be made. No automatic provider fallback.</p>
    <button className="wide" type="button" disabled={disabled || !settings || !scan.fields.length} onClick={onGenerate}>{builtin ? 'Generate suggestions on-device' : `Send to ${provider?.name ?? 'provider'} and generate suggestions`}</button>
    {!settings && <p className="hint">Enable a provider above to continue.</p>}
  </section>;
}
