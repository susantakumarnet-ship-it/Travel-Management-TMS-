import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: err.flatten() } });
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body' } });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: err.message } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      // MongoDB reports the index name (string); SQL reports column list.
      const raw = err.meta?.target;
      const target = (Array.isArray(raw) ? raw.join(', ') : String(raw ?? 'value'))
        .replace(/_unique(_partial)?$|_key$/, '')
        .replace(/^[a-z]+_/, '')
        .replace(/_/g, ' ');
      return res.status(409).json({ error: { code: 'DUPLICATE', message: `A record with this ${target} already exists` } });
    }
    if (err.code === 'P2023') {
      // Malformed ObjectId in a lookup → treat as not found.
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
    }
    if (err.code === 'P2034') {
      return res.status(409).json({ error: { code: 'BUSY', message: 'This record was updated at the same moment by another request. Please try again.' } });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
    }
    if (err.code === 'P2003') {
      return res
        .status(409)
        .json({ error: { code: 'IN_USE', message: 'This record is referenced by other data and cannot be changed' } });
    }
  }
  const msg = (err as Error)?.message ?? '';
  if (/Malformed ObjectID|invalid character .* in ObjectID/i.test(msg)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
  }
  if ((err as { type?: string })?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body' } });
  }
  // http-errors from body-parser/express (413 too large, 415 unsupported charset, …)
  const httpErr = err as { status?: number; statusCode?: number; expose?: boolean; type?: string; message?: string };
  const st = httpErr?.status ?? httpErr?.statusCode;
  if (typeof st === 'number' && st >= 400 && st < 500 && httpErr.expose !== false) {
    const code = httpErr.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST';
    const message = httpErr.type === 'entity.too.large' ? 'Request is too large' : (httpErr.message ?? 'Bad request');
    return res.status(st).json({ error: { code, message } });
  }
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
}
