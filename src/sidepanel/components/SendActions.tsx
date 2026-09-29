import { useEffect, useRef, useState } from 'react';
import type { ParsedDocument } from '../../parsers/types';
import type { BoundScan } from '../../shared/schemas';
import { resolveProvider, type ProviderSettings } from '../../ai/registry';
import { makePayload, SYSTEM_PROMPT } from '../../ai/prompts';
import { t } from '../../shared/i18n';

// The pre-match action area of the fields card. The two transparency
// disclosures (the exact outgoing payload and the system prompt) sit above one
// control: the main button sends once, and its attached menu turns auto-send on
// so future pages are matched without asking again.
export function SendActions({ parsed, scan, settings, disabled, onGenerate, onAutoSend }: {
  parsed: ParsedDocument; scan: BoundScan; settings?: ProviderSettings; disabled: boolean;
  onGenerate: () => void; onAutoSend: (value: boolean, immediate?: boolean) => void;
}) {
  const resolved = settings ? resolveProvider(settings) : undefined;
  const kind = resolved?.kind;
  const [open, setOpen] = useState(false);
  const split = useRef<HTMLDivElement>(null);
  // The menu is a popover: an outside click or Escape closes it so it never
  // blocks the rest of the panel.
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => { if (!split.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', escape); };
  }, [open]);
  const label = kind === 'builtin' ? t('generateBuiltin') : kind === 'local' || kind === 'preset' ? t('generateLocal') : t('generateCloud', [resolved?.name ?? t('generateCloudFallback')]);
  return <div className="send-actions">
    <details><summary>{t('previewOutgoing')}</summary><pre>{JSON.stringify(makePayload(parsed.lines, scan.fields), null, 2)}</pre></details>
    <details><summary>{t('viewMappingInstructions')}</summary><pre>{SYSTEM_PROMPT}</pre></details>
    <div className="split" ref={split}>
      <button type="button" className="split-main" disabled={disabled} onClick={onGenerate}>{label}</button>
      <button type="button" className="split-toggle" aria-haspopup="menu" aria-expanded={open} aria-label={t('sendOptions')} disabled={disabled} onClick={() => setOpen(value => !value)}>▾</button>
      {open && <div className="split-menu" role="menu">
        <button type="button" role="menuitem" disabled={disabled} onClick={() => { setOpen(false); onAutoSend(true, true); }}>{t('autoSendAlways')}</button>
      </div>}
    </div>
  </div>;
}
