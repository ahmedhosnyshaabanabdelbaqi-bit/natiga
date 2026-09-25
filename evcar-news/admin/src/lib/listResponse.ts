import { api, type QueryParams } from '@/api/client';
import type { ListMeta } from '@/api/types';

/**
 * Accepts either a list envelope `{ data: T[], meta }` or `{ data: T[] }` and
 * returns the rows (defensive while backend shapes settle).
 */
export function rowsOf<T>(res: { data?: unknown } | null | undefined): T[] {
  return Array.isArray(res?.data) ? (res.data as T[]) : [];
}

export function metaOf(res: { meta?: ListMeta } | null | undefined, fallbackCount = 0): ListMeta {
  return (
    res?.meta ?? {
      page: 1,
      pageSize: fallbackCount,
      total: fallbackCount,
      totalPages: 1,
    }
  );
}

/**
 * Fetches a small reference list completely. The first request carries no
 * paging params (works for non-paginated endpoints); if the response has
 * `meta.totalPages > 1`, the remaining pages are requested with `page`.
 */
export async function fetchAllRows<T>(
  path: string,
  signal?: AbortSignal,
  maxPages = 20,
): Promise<T[]> {
  const first = await api.get<{ data?: unknown; meta?: ListMeta }>(path, undefined, { signal });
  const rows = rowsOf<T>(first);
  const totalPages = Math.min(first?.meta?.totalPages ?? 1, maxPages);
  for (let page = 2; page <= totalPages; page += 1) {
    const query: QueryParams = { page, pageSize: first?.meta?.pageSize };
    const next = await api.get<{ data?: unknown }>(path, query, { signal });
    rows.push(...rowsOf<T>(next));
  }
  return rows;
}
