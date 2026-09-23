export type DocumentLine = { id: string; page: number; text: string };
export type DocumentKind = 'pdf' | 'docx' | 'xlsx' | 'markdown' | 'txt' | 'mixed';
export type ParsedDocument = { kind: DocumentKind; name: string; pages: number; characters: number; lines: DocumentLine[] };
