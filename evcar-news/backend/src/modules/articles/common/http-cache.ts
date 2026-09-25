import type { Response } from 'express';

/**
 * Cache headers of public GET routes (contract §4.3). Express adds a strong
 * ETag to every response and answers `If-None-Match` with 304 by itself
 * (`app.set('etag', 'strong')`), so only Cache-Control / Vary are set here.
 * Responses depend on the language and market headers → Vary on them.
 */
export function setPublicCache(res: Response, maxAgeSeconds: number): void {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 5}`,
  );
  res.setHeader('Vary', 'Accept-Language, X-Market');
}

/** Never cached (previews, admin data). */
export function setNoStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}
