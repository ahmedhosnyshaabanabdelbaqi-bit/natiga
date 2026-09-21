import { useCallback, useEffect, useState } from 'react';

export interface TableState {
  page: number;
  perPage: number;
  q: string;
  sort: string;
  direction: 'asc' | 'desc';
  filters: Record<string, string>;
}

const DEFAULT: TableState = {
  page: 1,
  perPage: 25,
  q: '',
  sort: '',
  direction: 'asc',
  filters: {},
};

/**
 * Table controls, persisted per screen.
 *
 * Column widths, filters and sort survive a reload, because re-applying the
 * same three filters every morning is exactly the kind of friction that makes
 * people export to a spreadsheet instead.
 */
export function useTableState(storageKey: string, initial: Partial<TableState> = {}) {
  const [state, setState] = useState<TableState>(() => {
    try {
      const saved = localStorage.getItem(`erp.table.${storageKey}`);
      if (saved) return { ...DEFAULT, ...initial, ...JSON.parse(saved), page: 1 };
    } catch {
      // Corrupt or unavailable storage is not worth failing a screen over.
    }
    return { ...DEFAULT, ...initial };
  });

  useEffect(() => {
    try {
      const { page: _page, ...persisted } = state;
      localStorage.setItem(`erp.table.${storageKey}`, JSON.stringify(persisted));
    } catch {
      // Ignore quota or private-mode failures.
    }
  }, [state, storageKey]);

  const setSearch = useCallback((q: string) => setState((s) => ({ ...s, q, page: 1 })), []);

  const setPage = useCallback((page: number) => setState((s) => ({ ...s, page })), []);

  const setPerPage = useCallback(
    (perPage: number) => setState((s) => ({ ...s, perPage, page: 1 })),
    [],
  );

  const setFilter = useCallback(
    (key: string, value: string) =>
      setState((s) => {
        const filters = { ...s.filters };
        if (value === '') delete filters[key];
        else filters[key] = value;
        return { ...s, filters, page: 1 };
      }),
    [],
  );

  const toggleSort = useCallback(
    (column: string) =>
      setState((s) => ({
        ...s,
        sort: column,
        direction: s.sort === column && s.direction === 'asc' ? 'desc' : 'asc',
        page: 1,
      })),
    [],
  );

  const reset = useCallback(() => setState({ ...DEFAULT, ...initial }), [initial]);

  /** Query parameters for the API, with empty values omitted. */
  const params = {
    page: state.page,
    per_page: state.perPage,
    ...(state.q ? { q: state.q } : {}),
    ...(state.sort ? { sort: state.sort, direction: state.direction } : {}),
    ...state.filters,
  };

  return { state, params, setSearch, setPage, setPerPage, setFilter, toggleSort, reset };
}
