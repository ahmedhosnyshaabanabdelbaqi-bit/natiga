import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { QueryParams } from '@/api/client';

export type SortDirection = 'asc' | 'desc';
export interface SortState {
  field: string;
  direction: SortDirection;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/** `-createdAt` → { field: 'createdAt', direction: 'desc' } */
export function parseSort(value: string | null | undefined): SortState | null {
  if (!value) return null;
  const desc = value.startsWith('-');
  const field = desc ? value.slice(1) : value;
  if (!/^[A-Za-z0-9_.]+$/.test(field)) return null;
  return { field, direction: desc ? 'desc' : 'asc' };
}

/**
 * Sort parameter format sent to the API: `sort=field` (ascending) or
 * `sort=-field` (descending). Single place to change if the backend differs.
 */
export function formatSort(sort: SortState | null | undefined): string | undefined {
  if (!sort) return undefined;
  return sort.direction === 'desc' ? `-${sort.field}` : sort.field;
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export interface TableState<F extends string> {
  page: number;
  pageSize: number;
  sort: SortState | null;
  filters: Record<F, string>;
  setPage(page: number): void;
  setPageSize(size: number): void;
  setSort(sort: SortState | null): void;
  setFilter(key: F, value: string | null | undefined): void;
  setFilters(values: Partial<Record<F, string | null | undefined>>): void;
  resetFilters(): void;
  /** Ready-to-send list query: page, pageSize, non-default sort and non-empty filters. */
  query: QueryParams;
}

/**
 * Server-side table state stored in the URL search params so that reload,
 * back/forward and shared links keep the same page, sort and filters.
 */
export function useTableState<F extends string = never>(options: {
  filters?: readonly F[];
  defaultSort?: SortState | null;
  defaultPageSize?: number;
  /** Prefix when a page hosts more than one table. */
  prefix?: string;
}): TableState<F> {
  const {
    filters: filterKeys = [],
    defaultSort = null,
    defaultPageSize = DEFAULT_PAGE_SIZE,
    prefix = '',
  } = options;
  const [params, setParams] = useSearchParams();
  const k = useCallback((name: string) => (prefix ? `${prefix}.${name}` : name), [prefix]);

  const page = clampInt(params.get(k('page')), 1, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampInt(params.get(k('pageSize')), defaultPageSize, 1, MAX_PAGE_SIZE);
  const sortParam = params.get(k('sort'));
  const sort = sortParam === '' ? null : (parseSort(sortParam) ?? defaultSort);
  const filterKeyList = filterKeys.join('|');
  const filters = useMemo(() => {
    const out = {} as Record<F, string>;
    for (const key of filterKeyList ? (filterKeyList.split('|') as F[]) : [])
      out[key] = params.get(k(key)) ?? '';
    return out;
  }, [params, filterKeyList, k]);

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setPage = useCallback(
    (p: number) =>
      update((next) => {
        if (p <= 1) next.delete(k('page'));
        else next.set(k('page'), String(p));
      }),
    [update, k],
  );

  const setPageSize = useCallback(
    (size: number) =>
      update((next) => {
        next.set(k('pageSize'), String(size));
        next.delete(k('page'));
      }),
    [update, k],
  );

  const setSort = useCallback(
    (s: SortState | null) =>
      update((next) => {
        const formatted = formatSort(s);
        // Empty value = explicitly unsorted (overrides the default sort).
        next.set(k('sort'), formatted ?? '');
        next.delete(k('page'));
      }),
    [update, k],
  );

  const setFilters = useCallback(
    (values: Partial<Record<F, string | null | undefined>>) =>
      update((next) => {
        for (const [key, value] of Object.entries(values) as [F, string | null | undefined][]) {
          if (value === null || value === undefined || value === '') next.delete(k(key));
          else next.set(k(key), value);
        }
        next.delete(k('page'));
      }),
    [update, k],
  );

  const setFilter = useCallback(
    (key: F, value: string | null | undefined) =>
      setFilters({ [key]: value } as Partial<Record<F, string | null | undefined>>),
    [setFilters],
  );

  const resetFilters = useCallback(
    () =>
      update((next) => {
        for (const key of filterKeyList ? filterKeyList.split('|') : []) next.delete(k(key));
        next.delete(k('page'));
      }),
    [update, filterKeyList, k],
  );

  const defaultSortParam = formatSort(defaultSort);
  const query = useMemo<QueryParams>(() => {
    // The default order is left to the server; `sort` is only sent when the
    // user picked another one (keeps lists working on endpoints without sort).
    const sortParam = formatSort(sort);
    const q: QueryParams = {
      page,
      pageSize,
      ...(sortParam && sortParam !== defaultSortParam ? { sort: sortParam } : {}),
    };
    for (const [key, value] of Object.entries(filters) as [string, string][]) {
      if (value) q[key] = value;
    }
    return q;
  }, [page, pageSize, sort, filters, defaultSortParam]);

  return {
    page,
    pageSize,
    sort,
    filters,
    setPage,
    setPageSize,
    setSort,
    setFilter,
    setFilters,
    resetFilters,
    query,
  };
}
