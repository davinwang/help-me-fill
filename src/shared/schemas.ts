import { z } from 'zod';

export const LIMITS = { bytes: 10 * 1024 * 1024, pages: 20, characters: 24_000, fields: 60, responseBytes: 256 * 1024, value: 4_000 } as const;
export const FieldSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(['text', 'email', 'tel', 'url', 'textarea', 'select', 'checkbox', 'richtext', 'date', 'month', 'time', 'datetime-local']),
  label: z.string().max(240), ariaLabel: z.string().max(240),
  placeholder: z.string().max(240), name: z.string().max(120),
  context: z.string().max(240), required: z.boolean(),
  maxLength: z.number().int().min(-1), pattern: z.string().max(500),
  options: z.array(z.string().max(240)).max(120).optional(),
}).strict();
export type FieldDescriptor = z.infer<typeof FieldSchema>;
export const LocalFieldSchema = FieldSchema.extend({ currentValue: z.string().max(LIMITS.value) });
export type LocalField = z.infer<typeof LocalFieldSchema>;
export const MappingSchema = z.object({
  assignments: z.array(z.object({
    fieldId: z.string().min(1).max(100), value: z.string().min(1).max(LIMITS.value),
    evidence: z.array(z.object({ lineId: z.string().max(80), quote: z.string().min(1).max(4_000) }).strict()).min(1).max(12),
    reason: z.string().min(1).max(500),
  }).strict()).max(LIMITS.fields),
  unmapped: z.array(z.object({ fieldId: z.string().min(1).max(100), reason: z.string().min(1).max(500) }).strict()).max(LIMITS.fields),
}).strict();
export type MappingPlan = z.infer<typeof MappingSchema>;
export type Assignment = MappingPlan['assignments'][number];
export const ScanSchema = z.object({
  scanId: z.string(), url: z.string(),
  fields: z.array(LocalFieldSchema).max(LIMITS.fields),
  exclusions: z.record(z.string(), z.number()),
}).strict();
export type Scan = z.infer<typeof ScanSchema>;
export type Target = { tabId: number; windowId: number; documentId: string; url: string };
export type BoundScan = Scan & { target: Target };
export type FillResult = { fieldId: string; status: 'filled' | 'skipped' | 'changed/reverted' | 'failed' | 'restored'; detail: string };
export const FillResultSchema = z.object({
  fieldId: z.string(), status: z.enum(['filled', 'skipped', 'changed/reverted', 'failed', 'restored']), detail: z.string(),
}).strict();
export const OperationResultSchema = z.object({ results: z.array(FillResultSchema), canUndo: z.boolean() }).strict();
export type OperationResult = z.infer<typeof OperationResultSchema>;
