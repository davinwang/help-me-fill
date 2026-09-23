import { useRef, useState } from 'react';
export function DropZone({ disabled, onFile, onError }: { disabled: boolean; onFile: (file: File) => void; onError: (text: string) => void }) {
  const input = useRef<HTMLInputElement>(null), [dragging, setDragging] = useState(false);
  function select(files: FileList | null) {
    if (disabled || !files?.length) return;
    if (files.length !== 1) { onError('Add one document at a time; parsed documents stay in the list below.'); return; }
    onFile(files[0]);
  }
  return <section className={`drop-zone ${dragging ? 'dragging' : ''}`} aria-label="Document upload"
    onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={event => { event.preventDefault(); setDragging(false); select(event.dataTransfer.files); }}>
    <span className="document-mark" aria-hidden="true"><i /><i /><i /></span>
    <h2>Start with your documents</h2>
    <p>Drop documents here, or choose a file. Add as many as you need.</p>
    <button type="button" className="secondary" disabled={disabled} onClick={() => input.current?.click()}>Choose document</button>
    <input ref={input} className="visually-hidden" type="file" accept=".pdf,.docx,.xlsx,.xls,.md,.markdown,.txt,application/pdf,text/markdown,text/plain" aria-label="Choose a document file" disabled={disabled} onChange={event => { select(event.target.files); event.target.value = ''; }} />
    <span className="hint">PDF · Word (.docx) · Excel (.xlsx/.xls) · Markdown (.md) · Text (.txt) · 10 MiB each</span>
  </section>;
}
