import { Link } from '@inertiajs/react';
import { useQueryState } from '@/components/shared/use-query-state';
import {
    Pagination as PaginationRoot,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type {
    Paginated,
    ResourcePaginated,
    SimplePaginated,
} from '@/types/pagination';

/** Normalised paginator information shared by Pagination and DataTable. */
export type PaginationMeta = {
    current_page: number;
    /** null for simple paginators (unknown total). */
    last_page: number | null;
    per_page: number;
    total: number | null;
    from: number | null;
    to: number | null;
    has_prev: boolean;
    has_next: boolean;
};

export type AnyPaginated<T> =
    | Paginated<T>
    | SimplePaginated<T>
    | ResourcePaginated<T>;

function isResourcePaginated<T>(
    data: AnyPaginated<T> | T[],
): data is ResourcePaginated<T> {
    return (
        !Array.isArray(data) &&
        'meta' in data &&
        typeof data.meta === 'object' &&
        data.meta !== null &&
        'current_page' in data.meta
    );
}

function isLengthAware<T>(data: AnyPaginated<T> | T[]): data is Paginated<T> {
    return (
        !Array.isArray(data) && 'last_page' in data && 'current_page' in data
    );
}

function isSimple<T>(data: AnyPaginated<T> | T[]): data is SimplePaginated<T> {
    return (
        !Array.isArray(data) && 'current_page' in data && !('last_page' in data)
    );
}

/** Accepts every Laravel paginator JSON shape (or a plain array) and returns rows + meta. */
export function normalizePaginated<T>(data: AnyPaginated<T> | T[]): {
    rows: T[];
    meta: PaginationMeta | null;
} {
    if (Array.isArray(data)) {
        return { rows: data, meta: null };
    }
    if (isResourcePaginated(data)) {
        const m = data.meta;
        return {
            rows: data.data,
            meta: {
                current_page: m.current_page,
                last_page: m.last_page,
                per_page: m.per_page,
                total: m.total,
                from: m.from,
                to: m.to,
                has_prev: data.links.prev !== null,
                has_next: data.links.next !== null,
            },
        };
    }
    if (isLengthAware(data)) {
        return {
            rows: data.data,
            meta: {
                current_page: data.current_page,
                last_page: data.last_page,
                per_page: data.per_page,
                total: data.total,
                from: data.from,
                to: data.to,
                has_prev: data.prev_page_url !== null,
                has_next: data.next_page_url !== null,
            },
        };
    }
    if (isSimple(data)) {
        return {
            rows: data.data,
            meta: {
                current_page: data.current_page,
                last_page: null,
                per_page: data.per_page,
                total: null,
                from: data.from,
                to: data.to,
                has_prev: data.prev_page_url !== null,
                has_next: data.next_page_url !== null,
            },
        };
    }
    return { rows: [], meta: null };
}

function pageRange(
    current: number,
    last: number,
    siblings: number,
): Array<number | 'gap'> {
    const pages = new Set<number>([1, last]);
    for (let page = current - siblings; page <= current + siblings; page++) {
        if (page >= 1 && page <= last) {
            pages.add(page);
        }
    }
    const sorted = [...pages].sort((a, b) => a - b);
    const result: Array<number | 'gap'> = [];
    let previous = 0;
    for (const page of sorted) {
        if (page - previous > 1) {
            result.push('gap');
        }
        result.push(page);
        previous = page;
    }
    return result;
}

type Props<T> = {
    /** Paginator JSON (any Laravel shape) or an already normalised meta object. */
    data: AnyPaginated<T> | PaginationMeta;
    /** Show "Showing X to Y of Z" (default true when the total is known). */
    showSummary?: boolean;
    /** Page links on each side of the current page. */
    siblings?: number;
    /** Partial reload: only refetch these props when changing page. */
    only?: string[];
    className?: string;
};

function isMeta<T>(
    data: AnyPaginated<T> | PaginationMeta,
): data is PaginationMeta {
    return 'has_next' in data && 'has_prev' in data;
}

/** Laravel paginator navigation that preserves the current filters, state and scroll. */
export function Pagination<T>({
    data,
    showSummary = true,
    siblings = 1,
    only,
    className,
}: Props<T>) {
    const { href } = useQueryState();
    const meta = isMeta(data) ? data : normalizePaginated(data).meta;
    if (
        !meta ||
        (!meta.has_prev && !meta.has_next && (meta.last_page ?? 1) <= 1)
    ) {
        return null;
    }
    const linkProps = {
        preserveState: true,
        preserveScroll: true,
        only,
    } as const;
    const pageHref = (page: number) =>
        href({ page: page === 1 ? null : String(page) });

    return (
        <div
            className={cn(
                'flex flex-col items-center justify-between gap-3 sm:flex-row',
                className,
            )}
        >
            {showSummary &&
            meta.total !== null &&
            meta.from !== null &&
            meta.to !== null ? (
                <p className="tabular text-sm text-muted-foreground">
                    {t('core.labels.showing', {
                        from: formatNumber(meta.from, 0),
                        to: formatNumber(meta.to, 0),
                        total: formatNumber(meta.total, 0),
                    })}
                </p>
            ) : (
                <span />
            )}
            <PaginationRoot className="mx-0 w-auto">
                <PaginationContent>
                    <PaginationItem>
                        {meta.has_prev ? (
                            <PaginationPrevious asChild>
                                <Link
                                    href={pageHref(meta.current_page - 1)}
                                    {...linkProps}
                                />
                            </PaginationPrevious>
                        ) : (
                            <PaginationPrevious
                                aria-disabled="true"
                                className="pointer-events-none opacity-50"
                            />
                        )}
                    </PaginationItem>
                    {meta.last_page !== null
                        ? pageRange(
                              meta.current_page,
                              meta.last_page,
                              siblings,
                          ).map((page, index) =>
                              page === 'gap' ? (
                                  <PaginationItem key={`gap-${index}`}>
                                      <PaginationEllipsis />
                                  </PaginationItem>
                              ) : (
                                  <PaginationItem key={page}>
                                      <PaginationLink
                                          asChild
                                          isActive={page === meta.current_page}
                                          aria-label={t('ui.pagination.page', {
                                              page,
                                          })}
                                      >
                                          <Link
                                              href={pageHref(page)}
                                              {...linkProps}
                                          >
                                              {formatNumber(page, 0)}
                                          </Link>
                                      </PaginationLink>
                                  </PaginationItem>
                              ),
                          )
                        : null}
                    <PaginationItem>
                        {meta.has_next ? (
                            <PaginationNext asChild>
                                <Link
                                    href={pageHref(meta.current_page + 1)}
                                    {...linkProps}
                                />
                            </PaginationNext>
                        ) : (
                            <PaginationNext
                                aria-disabled="true"
                                className="pointer-events-none opacity-50"
                            />
                        )}
                    </PaginationItem>
                </PaginationContent>
            </PaginationRoot>
        </div>
    );
}
