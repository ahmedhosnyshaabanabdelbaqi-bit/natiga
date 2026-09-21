import { useCallback, useEffect, useState } from 'react';
import { api, toApiError, type ApiError } from './api';
import type { TableMeta } from '../components/DataTable';

/**
 * قائمة مقسّمة من الخادم مع بحث وترتيب وتصفية.
 * كل التقسيم والترتيب يتم على الخادم، لا في المتصفح.
 */
export function useList<T>(endpoint: string, initialFilters: Record<string, unknown> = {}) {
  const [rows, setRows] = useState<T[]>([]);
  const [meta, setMeta] = useState<TableMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [filters, setFilters] = useState<Record<string, unknown>>(initialFilters);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(endpoint, {
        params: {
          page,
          search: search || undefined,
          sort: sort?.key,
          direction: sort?.direction,
          ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined && v !== null)),
        },
      });
      setRows(data.data ?? []);
      setMeta(data.meta ?? null);
    } catch (e) {
      setError(toApiError(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint, page, search, sort, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const setFilter = (key: string, value: unknown) => {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const doSearch = (term: string) => {
    setPage(1);
    setSearch(term);
  };

  return {
    rows, meta, loading, error, page, search, sort, filters,
    setPage, setSort, setFilter, setFilters, doSearch, reload: load,
  };
}
