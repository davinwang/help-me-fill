import { useRef, useState } from 'react';
import type { ParsedDocument } from '../../parsers/types';
import { t } from '../../shared/i18n';
import { DocumentPreview } from './DocumentPreview';
export function DropZone({ disabled, documents, onFile, onError, onRemove }: { disabled: boolean; documents: ParsedDocument[]; onFile: (file: File) => void; onError: (text: string) => void; onRemove: (index: number) => void }) {
  const input = useRef<HTMLInputElement>(null), [dragging, setDragging] = useState(false);
  function select(files: FileList | null) {
    if (disabled || !files?.length) return;
    if (files.length !== 1) { onError(t('errAddOneDocument')); return; }
    onFile(files[0]);
  }
  return <section className={`drop-zone ${dragging ? 'dragging' : ''}`} aria-label={t('dropZoneLabel')}
    onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={event => { event.preventDefault(); setDragging(false); select(event.dataTransfer.files); }}>
    <div className="drop-zone-intro">
      <span className="document-mark" aria-hidden="true"><i /><i /><i /></span>
      <h2>{t('dropZoneTitle')}</h2>
      <p>{t('dropZoneBody')}</p>
      <button type="button" className="secondary" disabled={disabled} onClick={() => input.current?.click()}>{t(documents.length ? 'chooseMoreDocuments' : 'chooseDocument')}</button>
      <input ref={input} className="visually-hidden" type="file" accept=".pdf,.docx,.xlsx,.xls,.md,.markdown,.txt,application/pdf,text/markdown,text/plain" aria-label={t('chooseDocumentFile')} disabled={disabled} onChange={event => { select(event.target.files); event.target.value = ''; }} />
      <span className="hint">{t('dropZoneFormats')}</span>
    </div>
    {!!documents.length && <div className="drop-zone-documents">
      {documents.map((document, index) => <DocumentPreview key={`${document.name}-${index}`} document={document} disabled={disabled} onRemove={() => onRemove(index)} />)}
    </div>}
  </section>;
}
