import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const VALID_ID = /^[A-Za-z0-9._:-]{8,64}$/;

/**
 * Express-level middleware registered before body parsing: reuses a sane
 * incoming X-Request-Id or generates a UUID, stores it on `req.id` and echoes
 * it in the response header.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const id = candidate && VALID_ID.test(candidate) ? candidate : randomUUID();
  (req as Request & { id?: string }).id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
