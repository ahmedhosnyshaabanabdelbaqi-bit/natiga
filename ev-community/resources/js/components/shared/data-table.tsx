import { router } from '@inertiajs/react';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, X } from 'lucide-react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Fragment, useEffect, useState } from 'react';
import { EmptyState, NoResults } from '@/components/shared/empty-state';
import type {
    AnyPaginated,
    PaginationMeta,
} from '@/components/shared/pagination';
import { normalizePaginated, Pagination } from '@/components/shared/pagination';
import { SkeletonCards } from '@/components/shared/skeletons';
import { useQueryState } from '@/components/shared/use-query-state';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type RowKey = string | number;

export type DataTableColumn<T> = {
    /** Unique column id; also the default sort key and the default row property to render. */
    key: string;
    header: ReactNode;
    cell?: (row: T, index: number) => ReactNode;
    sortable?: boolean;
    /** Value sent as `sort=` when different from `key`. */
    sortKey?: string;
    className?: string;
    headerClassName?: string;
    align?: 'start' | 'center' | 'end';
    /** Omit from the mobile card list. */
    hideOnMobile?: boolean;
    /** Hidden until the user enables it in the column toggle. */
    defaultHidden?: boolean;
    /** Cannot be hidden. */
    required?: boolean;
};

export type DataTableProps<T> = {
    /** Stable id: namespaces the column-visibility preference in localStorage. */
    id: string;
    columns: DataTableColumn<T>[];
    /** Laravel paginator JSON (any shape) or a plain array. */
    data: AnyPaginated<T> | T[];
    rowKey: keyof T | ((row: T) => RowKey);
    selectable?: boolean;
    /** Rendered in the selection bar; receives the selected row keys and a `clear` callback. */
    bulkActions?: (selected: RowKey[], clear: () => void) => ReactNode;
    onRowClick?: (row: T) => void;
    rowHref?: (row: T) => string;
    rowClassName?: (row: T) => string | undefined;
    /** Overrides the automatic Inertia navigation loading state. */
    loading?: boolean;
    columnToggle?: boolean;
    perPageOptions?: number[];
    /** Full replacement for the empty state. */
    emptyState?: ReactNode;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyAction?: ReactNode;
    /** True when filters are active: an empty result shows "no results" + reset instead of "empty". */
    filtered?: boolean;
    onResetFilters?: () => void;
    /** Rendered above the table (e.g. a FiltersBar). */
    toolbar?: ReactNode;
    /** Screen-reader caption. */
    caption?: string;
    /** Title of the mobile card (defaults to the first visible column). */
    mobileTitle?: (row: T) => ReactNode;
    dense?: boolean;
    className?: string;
};

const PER_PAGE_DEFAULT = [15, 25, 50, 100];
const SORT_KEYS = ['sort', 'direction', 'per_page'];

/** True while an Inertia GET visit to the current path is in flight (prefetches ignored). */
export function useInertiaLoading(): boolean {
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        const path = window.location.pathname;
        const offStart = router.on('start', (event) => {
            const visit = event.detail.visit;
            if (
                visit.method === 'get' &&
                !visit.prefetch &&
                visit.url.pathname === path
            ) {
                setLoading(true);
            }
        });
        const offFinish = router.on('finish', () => setLoading(false));
        return () => {
            offStart();
            offFinish();
        };
    }, []);
    return loading;
}

function storageKey(id: string): string {
    return `ev.table.${id}.hidden`;
}

function readHidden(id: string): string[] | null {
    try {
        const raw = window.localStorage.getItem(storageKey(id));
        if (!raw) {
            return null;
        }
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.filter((item): item is string => typeof item === 'string')
            : null;
    } catch {
        return null;
    }
}

function writeHidden(id: string, hidden: string[]): void {
    try {
        window.localStorage.setItem(storageKey(id), JSON.stringify(hidden));
    } catch {
        // UI convenience only; ignore quota/private-mode failures.
    }
}

function defaultCell<T>(row: T, key: string): ReactNode {
    const value = (row as Record<string, unknown>)[key];
    if (value === null || value === undefined || value === '') {
        return <span className="text-muted-foreground">—</span>;
    }
    if (typeof value === 'boolean') {
        return value ? t('core.labels.yes') : t('core.labels.no');
    }
    if (typeof value === 'string' || typeof value === 'number') {
        return String(value);
    }
    return null;
}

function alignClass(
    align: DataTableColumn<unknown>['align'],
): string | undefined {
    return align === 'end'
        ? 'text-end'
        : align === 'center'
          ? 'text-center'
          : undefined;
}

const INTERACTIVE_SELECTOR =
    'a,button,input,select,textarea,label,[role="checkbox"],[role="menuitem"],[data-no-row-click]';

function PerPageSelect({
    id,
    meta,
    options,
}: {
    id: string;
    meta: PaginationMeta;
    options: number[];
}) {
    const { patch } = useQueryState();
    const list = options.includes(meta.per_page)
        ? options
        : [...options, meta.per_page].sort((a, b) => a - b);
    const labelId = `${id}-per-page`;
    return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span id={labelId}>{t('ui.table.rows_per_page')}</span>
            <Select
                value={String(meta.per_page)}
                onValueChange={(value) => patch({ per_page: value })}
            >
                <SelectTrigger
                    size="sm"
                    aria-labelledby={labelId}
                    className="tabular w-20"
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {list.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                            {size}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

/**
 * Server-driven table: sorting, per-page and pagination live in the URL query
 * (`sort`, `direction`, `per_page`, `page`); the server returns the rows.
 * Renders a card list on small screens.
 */
export function DataTable<T>({
    id,
    columns,
    data,
    rowKey,
    selectable = false,
    bulkActions,
    onRowClick,
    rowHref,
    rowClassName,
    loading: loadingProp,
    columnToggle = true,
    perPageOptions = PER_PAGE_DEFAULT,
    emptyState,
    emptyTitle,
    emptyDescription,
    emptyAction,
    filtered = false,
    onResetFilters,
    toolbar,
    caption,
    mobileTitle,
    dense = false,
    className,
}: DataTableProps<T>) {
    const query = useQueryState();
    const isMobile = useIsMobile();
    const navigating = useInertiaLoading();
    const loading = loadingProp ?? navigating;
    const { rows, meta } = normalizePaginated(data);

    const [hidden, setHidden] = useState<string[]>(
        () =>
            (typeof window === 'undefined' ? null : readHidden(id)) ??
            columns
                .filter((column) => column.defaultHidden)
                .map((column) => column.key),
    );
    // Selection is tied to the current data set: a new page/result set clears it.
    const [selection, setSelection] = useState<{
        source: unknown;
        keys: RowKey[];
    }>({ source: data, keys: [] });
    const selected = selection.source === data ? selection.keys : [];
    const setSelected = (keys: RowKey[]) =>
        setSelection({ source: data, keys });

    const keyOf = (row: T): RowKey => {
        if (typeof rowKey === 'function') {
            return rowKey(row);
        }
        const value: unknown = row[rowKey];
        return typeof value === 'number' ? value : String(value);
    };

    const visible = columns.filter(
        (column) => column.required || !hidden.includes(column.key),
    );
    const mobileColumns = visible.filter((column) => !column.hideOnMobile);
    const toggleColumn = (key: string, shown: boolean) => {
        const next = shown
            ? hidden.filter((item) => item !== key)
            : [...hidden.filter((item) => item !== key), key];
        setHidden(next);
        writeHidden(id, next);
    };

    const sort = query.get('sort');
    const direction = query.get('direction') === 'desc' ? 'desc' : 'asc';
    const onSort = (column: DataTableColumn<T>) => {
        const key = column.sortKey ?? column.key;
        query.patch({
            sort: key,
            direction: sort === key && direction === 'asc' ? 'desc' : 'asc',
        });
    };

    const renderCell = (
        column: DataTableColumn<T>,
        row: T,
        index: number,
    ): ReactNode =>
        column.cell ? column.cell(row, index) : defaultCell(row, column.key);

    const interactive = Boolean(onRowClick || rowHref);
    const activate = (row: T, newTab = false) => {
        if (onRowClick) {
            onRowClick(row);
            return;
        }
        if (rowHref) {
            const href = rowHref(row);
            if (newTab) {
                window.open(href, '_blank', 'noopener');
            } else {
                router.visit(href);
            }
        }
    };
    const rowProps = (row: T) =>
        interactive
            ? {
                  tabIndex: 0,
                  onClick: (event: MouseEvent<HTMLElement>) => {
                      if (
                          (event.target as HTMLElement).closest(
                              INTERACTIVE_SELECTOR,
                          )
                      ) {
                          return;
                      }
                      activate(row, event.ctrlKey || event.metaKey);
                  },
                  onAuxClick: (event: MouseEvent<HTMLElement>) => {
                      if (
                          event.button === 1 &&
                          rowHref &&
                          !(event.target as HTMLElement).closest(
                              INTERACTIVE_SELECTOR,
                          )
                      ) {
                          activate(row, true);
                      }
                  },
                  onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
                      if (
                          (event.key === 'Enter' || event.key === ' ') &&
                          event.target === event.currentTarget
                      ) {
                          event.preventDefault();
                          activate(row);
                      }
                  },
              }
            : {};

    const allKeys = rows.map(keyOf);
    const allSelected =
        allKeys.length > 0 && allKeys.every((key) => selected.includes(key));
    const someSelected = selected.length > 0 && !allSelected;
    const toggleRow = (key: RowKey, checked: boolean) =>
        setSelected(
            checked
                ? [...selected.filter((item) => item !== key), key]
                : selected.filter((item) => item !== key),
        );

    const header =
        toolbar || (columnToggle && !isMobile) || selected.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
                {toolbar ? (
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        {toolbar}
                    </div>
                ) : null}
                {selected.length > 0 ? (
                    <div
                        className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm"
                        aria-live="polite"
                    >
                        <span className="tabular font-medium">
                            {t('ui.table.selected', { count: selected.length })}
                        </span>
                        {bulkActions?.(selected, () => setSelected([]))}
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelected([])}
                        >
                            <X className="size-4" aria-hidden="true" />
                            {t('ui.table.clear_selection')}
                        </Button>
                    </div>
                ) : null}
                {columnToggle && !isMobile ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="ms-auto"
                            >
                                <Columns3
                                    className="size-4"
                                    aria-hidden="true"
                                />
                                {t('ui.table.columns')}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel>
                                {t('ui.table.toggle_columns')}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {columns.map((column) => (
                                <DropdownMenuCheckboxItem
                                    key={column.key}
                                    checked={
                                        column.required ||
                                        !hidden.includes(column.key)
                                    }
                                    disabled={column.required}
                                    onCheckedChange={(checked) =>
                                        toggleColumn(
                                            column.key,
                                            checked === true,
                                        )
                                    }
                                    onSelect={(event) => event.preventDefault()}
                                >
                                    {column.header}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : null}
            </div>
        ) : null;

    const empty =
        emptyState ??
        (filtered ? (
            <NoResults
                onReset={onResetFilters ?? (() => query.reset(SORT_KEYS))}
            />
        ) : (
            <EmptyState
                title={emptyTitle}
                description={emptyDescription}
                action={emptyAction}
            />
        ));

    const footer = meta ? (
        <div className="flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <PerPageSelect id={id} meta={meta} options={perPageOptions} />
            <Pagination data={meta} />
        </div>
    ) : null;

    const skeletonRows = Math.min(Math.max(rows.length, 5), 10);

    if (isMobile) {
        return (
            <div
                className={cn('flex flex-col gap-3', className)}
                data-slot="data-table"
            >
                {header}
                {loading ? (
                    <SkeletonCards
                        count={3}
                        className="grid-cols-1 sm:grid-cols-1 lg:grid-cols-1"
                    />
                ) : rows.length === 0 ? (
                    empty
                ) : (
                    <ul className="grid gap-3" aria-busy={loading || undefined}>
                        {rows.map((row, index) => {
                            const key = keyOf(row);
                            const isSelected = selected.includes(key);
                            const [titleColumn, ...rest] = mobileColumns;
                            return (
                                <li
                                    key={key}
                                    data-state={
                                        isSelected ? 'selected' : undefined
                                    }
                                    className={cn(
                                        'rounded-xl border bg-card p-4 shadow-card',
                                        interactive &&
                                            'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
                                        isSelected &&
                                            'border-brand/50 bg-brand-soft/20',
                                        rowClassName?.(row),
                                    )}
                                    {...rowProps(row)}
                                >
                                    <div className="flex items-start gap-3">
                                        {selectable ? (
                                            <Checkbox
                                                className="mt-1"
                                                checked={isSelected}
                                                onCheckedChange={(checked) =>
                                                    toggleRow(
                                                        key,
                                                        checked === true,
                                                    )
                                                }
                                                aria-label={t(
                                                    'ui.table.select_row',
                                                )}
                                            />
                                        ) : null}
                                        <div className="min-w-0 flex-1">
                                            <div className="font-medium break-words">
                                                {mobileTitle
                                                    ? mobileTitle(row)
                                                    : titleColumn
                                                      ? renderCell(
                                                            titleColumn,
                                                            row,
                                                            index,
                                                        )
                                                      : null}
                                            </div>
                                            {rest.length > 0 ? (
                                                <dl className="mt-2 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                                                    {rest.map((column) => (
                                                        <Fragment
                                                            key={column.key}
                                                        >
                                                            <dt className="text-muted-foreground">
                                                                {column.header}
                                                            </dt>
                                                            <dd
                                                                className={cn(
                                                                    'min-w-0 text-end break-words',
                                                                    column.className,
                                                                )}
                                                            >
                                                                {renderCell(
                                                                    column,
                                                                    row,
                                                                    index,
                                                                )}
                                                            </dd>
                                                        </Fragment>
                                                    ))}
                                                </dl>
                                            ) : null}
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
                {footer ? (
                    <div className="rounded-xl border bg-card">{footer}</div>
                ) : null}
            </div>
        );
    }

    return (
        <div
            className={cn('flex flex-col gap-3', className)}
            data-slot="data-table"
        >
            {header}
            <div className="overflow-hidden rounded-xl border bg-card shadow-card">
                {!loading && rows.length === 0 ? (
                    <div className="p-4">{empty}</div>
                ) : (
                    <Table>
                        {caption ? (
                            <TableCaption className="sr-only">
                                {caption}
                            </TableCaption>
                        ) : null}
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                {selectable ? (
                                    <TableHead className="w-10">
                                        <Checkbox
                                            checked={
                                                allSelected
                                                    ? true
                                                    : someSelected
                                                      ? 'indeterminate'
                                                      : false
                                            }
                                            onCheckedChange={(checked) =>
                                                setSelected(
                                                    checked === true
                                                        ? allKeys
                                                        : [],
                                                )
                                            }
                                            aria-label={t(
                                                'ui.table.select_all',
                                            )}
                                            disabled={
                                                rows.length === 0 || loading
                                            }
                                        />
                                    </TableHead>
                                ) : null}
                                {visible.map((column) => {
                                    const key = column.sortKey ?? column.key;
                                    const isSorted =
                                        column.sortable === true &&
                                        sort === key;
                                    const SortIcon = isSorted
                                        ? direction === 'asc'
                                            ? ArrowUp
                                            : ArrowDown
                                        : ArrowUpDown;
                                    return (
                                        <TableHead
                                            key={column.key}
                                            aria-sort={
                                                column.sortable
                                                    ? isSorted
                                                        ? direction === 'asc'
                                                            ? 'ascending'
                                                            : 'descending'
                                                        : 'none'
                                                    : undefined
                                            }
                                            className={cn(
                                                alignClass(column.align),
                                                column.headerClassName,
                                            )}
                                        >
                                            {column.sortable ? (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onSort(column)
                                                    }
                                                    className={cn(
                                                        'inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60',
                                                        !isSorted &&
                                                            'text-muted-foreground',
                                                    )}
                                                    aria-label={t(
                                                        'ui.table.sort_by',
                                                        {
                                                            column:
                                                                typeof column.header ===
                                                                'string'
                                                                    ? column.header
                                                                    : column.key,
                                                        },
                                                    )}
                                                >
                                                    {column.header}
                                                    <SortIcon
                                                        className="size-3.5"
                                                        aria-hidden="true"
                                                    />
                                                </button>
                                            ) : (
                                                column.header
                                            )}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        </TableHeader>
                        <TableBody aria-busy={loading || undefined}>
                            {loading
                                ? Array.from(
                                      { length: skeletonRows },
                                      (_, index) => (
                                          <TableRow
                                              key={`skeleton-${index}`}
                                              className="hover:bg-transparent"
                                          >
                                              {selectable ? (
                                                  <TableCell>
                                                      <Skeleton className="size-4" />
                                                  </TableCell>
                                              ) : null}
                                              {visible.map((column) => (
                                                  <TableCell
                                                      key={column.key}
                                                      className={
                                                          dense
                                                              ? 'py-2'
                                                              : 'py-3'
                                                      }
                                                  >
                                                      <Skeleton className="h-4 w-full max-w-40" />
                                                  </TableCell>
                                              ))}
                                          </TableRow>
                                      ),
                                  )
                                : rows.map((row, index) => {
                                      const key = keyOf(row);
                                      const isSelected = selected.includes(key);
                                      return (
                                          <TableRow
                                              key={key}
                                              data-state={
                                                  isSelected
                                                      ? 'selected'
                                                      : undefined
                                              }
                                              className={cn(
                                                  interactive &&
                                                      'cursor-pointer outline-none focus-visible:bg-muted/60',
                                                  rowClassName?.(row),
                                              )}
                                              {...rowProps(row)}
                                          >
                                              {selectable ? (
                                                  <TableCell className="w-10">
                                                      <Checkbox
                                                          checked={isSelected}
                                                          onCheckedChange={(
                                                              checked,
                                                          ) =>
                                                              toggleRow(
                                                                  key,
                                                                  checked ===
                                                                      true,
                                                              )
                                                          }
                                                          aria-label={t(
                                                              'ui.table.select_row',
                                                          )}
                                                      />
                                                  </TableCell>
                                              ) : null}
                                              {visible.map((column) => (
                                                  <TableCell
                                                      key={column.key}
                                                      className={cn(
                                                          dense
                                                              ? 'py-1.5'
                                                              : 'py-2.5',
                                                          alignClass(
                                                              column.align,
                                                          ),
                                                          column.className,
                                                      )}
                                                  >
                                                      {renderCell(
                                                          column,
                                                          row,
                                                          index,
                                                      )}
                                                  </TableCell>
                                              ))}
                                          </TableRow>
                                      );
                                  })}
                        </TableBody>
                    </Table>
                )}
                {footer}
            </div>
        </div>
    );
}
