import { router, usePage } from '@inertiajs/react';
import { useCallback, useMemo } from 'react';

export type QueryValue = string | string[] | null | undefined;
export type QueryRecord = Record<string, string | string[]>;

/** Parses `?a=1&b[]=x&b[]=y` into `{ a: '1', b: ['x', 'y'] }`. */
export function parseQuery(url: string): { path: string; query: QueryRecord } {
    const [rawPath = '', rawQuery = ''] = url.split('?', 2);
    const query: QueryRecord = {};
    const params = new URLSearchParams(rawQuery.split('#')[0] ?? '');
    for (const [rawKey, value] of params.entries()) {
        const isArray = rawKey.endsWith('[]');
        const key = isArray ? rawKey.slice(0, -2) : rawKey;
        const existing = query[key];
        if (isArray || existing !== undefined) {
            const list = Array.isArray(existing) ? existing : existing !== undefined ? [existing] : [];
            list.push(value);
            query[key] = list;
        } else {
            query[key] = value;
        }
    }
    return { path: rawPath, query };
}

/** Builds a Laravel-style query string (`b[]=x&b[]=y`), skipping empty values. */
export function buildQuery(query: Record<string, QueryValue>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === null || value === undefined || value === '') {
            continue;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                if (item !== '') {
                    params.append(`${key}[]`, item);
                }
            }
            continue;
        }
        params.append(key, value);
    }
    const string = params.toString();
    return string ? `?${string}` : '';
}

export type QueryNavigateOptions = {
    /** Drop the `page` param so filter changes start at page 1 (default true). */
    resetPage?: boolean;
    /** Use history.replaceState instead of pushState (default true). */
    replace?: boolean;
    preserveState?: boolean;
    preserveScroll?: boolean;
    /** Partial reload: only fetch these props. */
    only?: string[];
};

export type QueryState = {
    /** Current pathname without the query string. */
    path: string;
    /** Current query params (arrays for `key[]`). */
    query: QueryRecord;
    get: (key: string) => string | undefined;
    getAll: (key: string) => string[];
    /** Build an href with the changes merged into the current query. */
    href: (changes: Record<string, QueryValue>, options?: Pick<QueryNavigateOptions, 'resetPage'>) => string;
    /** Merge changes into the query and navigate (Inertia GET, preserveState + preserveScroll). */
    patch: (changes: Record<string, QueryValue>, options?: QueryNavigateOptions) => void;
    /** Replace the whole query. */
    set: (next: Record<string, QueryValue>, options?: QueryNavigateOptions) => void;
    /** Remove the given keys. */
    remove: (keys: string[], options?: QueryNavigateOptions) => void;
    /** Clear every param except `keep`. */
    reset: (keep?: string[], options?: QueryNavigateOptions) => void;
};

function merge(current: QueryRecord, changes: Record<string, QueryValue>, resetPage: boolean): Record<string, QueryValue> {
    const next: Record<string, QueryValue> = { ...current, ...changes };
    if (resetPage && !('page' in changes)) {
        delete next.page;
    }
    return next;
}

/** Read and update URL query params through the Inertia router (server-driven lists). */
export function useQueryState(): QueryState {
    const { url } = usePage();
    const parsed = useMemo(() => parseQuery(url), [url]);

    const navigate = useCallback(
        (next: Record<string, QueryValue>, options: QueryNavigateOptions = {}) => {
            router.visit(`${parsed.path}${buildQuery(next)}`, {
                method: 'get',
                preserveState: options.preserveState ?? true,
                preserveScroll: options.preserveScroll ?? true,
                replace: options.replace ?? true,
                only: options.only,
            });
        },
        [parsed.path],
    );

    return useMemo<QueryState>(
        () => ({
            path: parsed.path,
            query: parsed.query,
            get: (key) => {
                const value = parsed.query[key];
                return Array.isArray(value) ? value[0] : value;
            },
            getAll: (key) => {
                const value = parsed.query[key];
                return value === undefined ? [] : Array.isArray(value) ? value : [value];
            },
            href: (changes, options = {}) => `${parsed.path}${buildQuery(merge(parsed.query, changes, options.resetPage ?? false))}`,
            patch: (changes, options = {}) => navigate(merge(parsed.query, changes, options.resetPage ?? true), options),
            set: (next, options = {}) => navigate(next, options),
            remove: (keys, options = {}) => {
                const next: Record<string, QueryValue> = { ...parsed.query };
                for (const key of keys) {
                    delete next[key];
                }
                navigate(merge({}, next, options.resetPage ?? true), options);
            },
            reset: (keep = [], options = {}) => {
                const next: Record<string, QueryValue> = {};
                for (const key of keep) {
                    if (parsed.query[key] !== undefined) {
                        next[key] = parsed.query[key];
                    }
                }
                navigate(next, options);
            },
        }),
        [parsed, navigate],
    );
}
