import { buildPageMeta, type PageMeta, type PageRequest } from './pagination';

/** Single resource envelope: { data: T } */
export interface DataResponse<T> {
  data: T;
}

/** List envelope: { data: T[], meta: { page, pageSize, total, totalPages } } */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PageMeta;
}

/** Cursor-based list envelope (geo / infinite lists). */
export interface CursorResponse<T> {
  data: T[];
  meta: { nextCursor: string | null; pageSize: number };
}

export function ok<T>(data: T): DataResponse<T> {
  return { data };
}

/**
 * A complete (unpaginated) list in the contract's list envelope: small
 * reference lists (markets, currencies, roles, settings, sessions…) are
 * returned whole as page 1 of 1 so every list has the same shape (§4.3).
 */
export function listOf<T>(data: T[]): PaginatedResponse<T> {
  return { data, meta: buildPageMeta(data.length, 1, Math.max(data.length, 1)) };
}

export function paginated<T>(
  data: T[],
  total: number,
  page: Pick<PageRequest, 'page' | 'pageSize'>,
): PaginatedResponse<T> {
  return { data, meta: buildPageMeta(total, page.page, page.pageSize) };
}

export function cursorPage<T>(
  data: T[],
  nextCursor: string | null,
  pageSize: number,
): CursorResponse<T> {
  return { data, meta: { nextCursor, pageSize } };
}
