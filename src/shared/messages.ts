import { z } from 'zod';
import { LIMITS } from './schemas';

export const WriteSchema = z.object({
  fieldId: z.string().min(1).max(100), value: z.string().max(LIMITS.value),
  expectedValue: z.string().max(LIMITS.value), allowOverwrite: z.boolean(),
}).strict();
export type WriteAssignment = z.infer<typeof WriteSchema>;
const base = { requestId: z.string().uuid() };
const scan = { ...base, scanId: z.string().uuid(), expectedUrl: z.string().max(8_192) };
export const ContentMessageSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('SCAN'), expectedUrl: z.string().max(8_192) }).strict(),
  z.object({ ...scan, type: z.literal('FILL'), assignments: z.array(WriteSchema).min(1).max(LIMITS.fields) }).strict(),
  z.object({ ...scan, type: z.literal('UNDO') }).strict(),
  z.object({ ...base, type: z.literal('CLEAR') }).strict(),
  z.object({ ...base, type: z.literal('CANCEL') }).strict(),
]);
export type ContentMessage = z.infer<typeof ContentMessageSchema>;
export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };
