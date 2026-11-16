import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { AppError } from './errors.js';

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new AppError(400, 'Validation failed', 'VALIDATION_ERROR', r.error.flatten());
  }
  return r.data;
}

export const body = <T extends ZodTypeAny>(req: Request, schema: T): z.infer<T> => parse(schema, req.body);
export const query = <T extends ZodTypeAny>(req: Request, schema: T): z.infer<T> => parse(schema, req.query);

// Common field schemas
export const zPhone = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-]/g, '').replace(/^\+?91(?=\d{10}$)/, ''))
  .refine((s) => /^[6-9]\d{9}$/.test(s), 'Enter a valid 10-digit Indian mobile number');
export const zId = z.string().min(1).max(40);
export const zMoney = z.coerce.number().min(0).max(99_999_999);
export const zBoolish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');
export const zPage = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
/** Strip HTML tags from free text to prevent stored XSS when rendered outside React. */
export const zText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s.replace(/<[^>]*>/g, ''));
