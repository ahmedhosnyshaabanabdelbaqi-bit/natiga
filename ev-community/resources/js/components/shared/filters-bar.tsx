import { ChevronDown, Filter, Search, X } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { QueryValue } from '@/components/shared/use-query-state';
import { useQueryState } from '@/components/shared/use-query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DateInput } from '@/components/ui/date-input';
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatDate } from '@/lib/format';
import { currentLocale, t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export { useQueryState } from '@/components/shared/use-query-state';
export type {
    QueryNavigateOptions,
    QueryState,
    QueryValue,
} from '@/components/shared/use-query-state';

export type FilterOption = { value: string; label: string };
export type FilterType =
    | 'search'
    | 'select'
    | 'multiselect'
    | 'date'
    | 'daterange'
    | 'boolean';

export type FilterDefinition = {
    /** Query parameter name (for `daterange` it is only a prefix, see fromKey/toKey). */
    key: string;
    type: FilterType;
    label: string;
    placeholder?: string;
    /** Required for `select` and `multiselect`. */
    options?: FilterOption[];
    /** `daterange` only: query keys for the bounds (default `<key>_from` / `<key>_to`). */
    fromKey?: string;
    toKey?: string;
    /** Extra classes for the inline control (e.g. a wider search box). */
    className?: string;
};

/** Values keyed by query parameter; `multiselect` values are arrays. */
export type FilterValues = Record<string, string | string[] | undefined>;

const ALL = '__all__';
export const SEARCH_DEBOUNCE_MS = 400;

/** Query keys a filter definition reads/writes. */
export function filterKeys(filter: FilterDefinition): string[] {
    if (filter.type === 'daterange') {
        return rangeKeys(filter);
    }
    return [filter.key];
}

function rangeKeys(filter: FilterDefinition): [string, string] {
    return [
        filter.fromKey ?? `${filter.key}_from`,
        filter.toKey ?? `${filter.key}_to`,
    ];
}

function single(values: FilterValues, key: string): string | undefined {
    const value = values[key];
    return Array.isArray(value) ? value[0] : value;
}

function list(values: FilterValues, key: string): string[] {
    const value = values[key];
    return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

export function isFilterActive(
    filter: FilterDefinition,
    values: FilterValues,
): boolean {
    return filterKeys(filter).some((key) =>
        list(values, key).some((value) => value !== ''),
    );
}

function describeFilter(
    filter: FilterDefinition,
    values: FilterValues,
): string {
    switch (filter.type) {
        case 'select': {
            const value = single(values, filter.key);
            return (
                filter.options?.find((option) => option.value === value)
                    ?.label ??
                value ??
                ''
            );
        }
        case 'multiselect':
            return list(values, filter.key)
                .map(
                    (value) =>
                        filter.options?.find((option) => option.value === value)
                            ?.label ?? value,
                )
                .join(currentLocale() === 'ar' ? '، ' : ', ');
        case 'boolean':
            return single(values, filter.key) === '1'
                ? t('core.labels.yes')
                : t('core.labels.no');
        case 'date':
            return formatDate(single(values, filter.key));
        case 'daterange': {
            const [fromKey, toKey] = rangeKeys(filter);
            const from = single(values, fromKey);
            const to = single(values, toKey);
            return `${from ? formatDate(from) : '…'} – ${to ? formatDate(to) : '…'}`;
        }
        default:
            return single(values, filter.key) ?? '';
    }
}

function SearchControl({
    filter,
    value,
    onCommit,
    className,
}: {
    filter: FilterDefinition;
    value: string;
    onCommit: (value: string) => void;
    className?: string;
}) {
    const [draft, setDraft] = useState(value);
    const [seen, setSeen] = useState(value);
    const timer = useRef<number | undefined>(undefined);

    // Adopt external changes (reset button, chip removal) without fighting the user's typing.
    if (value !== seen) {
        setSeen(value);
        setDraft(value);
    }

    useEffect(() => () => window.clearTimeout(timer.current), []);

    const commit = (next: string) => {
        window.clearTimeout(timer.current);
        setSeen(next);
        onCommit(next);
    };

    return (
        <div className={cn('relative', className)}>
            <Search
                aria-hidden="true"
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
                type="search"
                value={draft}
                aria-label={filter.label}
                placeholder={filter.placeholder ?? t('ui.filters.search')}
                className="ps-9"
                onChange={(event) => {
                    const next = event.target.value;
                    setDraft(next);
                    window.clearTimeout(timer.current);
                    timer.current = window.setTimeout(
                        () => commit(next),
                        SEARCH_DEBOUNCE_MS,
                    );
                }}
                onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        commit(draft);
                    }
                }}
            />
        </div>
    );
}

function SelectControl({
    filter,
    value,
    onSet,
    stacked,
}: {
    filter: FilterDefinition;
    value: string | undefined;
    onSet: (value: string | undefined) => void;
    stacked: boolean;
}) {
    const options: FilterOption[] =
        filter.type === 'boolean'
            ? [
                  { value: '1', label: t('core.labels.yes') },
                  { value: '0', label: t('core.labels.no') },
              ]
            : (filter.options ?? []);
    const selected = options.find((option) => option.value === value);
    return (
        <Select
            value={value ?? ALL}
            onValueChange={(next) => onSet(next === ALL ? undefined : next)}
        >
            <SelectTrigger
                aria-label={filter.label}
                className={cn('w-full', !stacked && 'md:w-auto md:min-w-36')}
            >
                <SelectValue placeholder={filter.label}>
                    {selected
                        ? stacked
                            ? selected.label
                            : `${filter.label}: ${selected.label}`
                        : filter.label}
                </SelectValue>
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL}>{t('ui.filters.all')}</SelectItem>
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function MultiSelectControl({
    filter,
    values,
    onSet,
    stacked,
}: {
    filter: FilterDefinition;
    values: string[];
    onSet: (values: string[]) => void;
    stacked: boolean;
}) {
    const options = filter.options ?? [];
    const count = values.length;
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    className={cn(
                        'justify-between font-normal',
                        stacked ? 'w-full' : 'w-full md:w-auto md:min-w-36',
                    )}
                    aria-label={filter.label}
                >
                    <span className="truncate">{filter.label}</span>
                    {count > 0 ? (
                        <Badge variant="secondary">{count}</Badge>
                    ) : (
                        <ChevronDown
                            className="size-4 opacity-50"
                            aria-hidden="true"
                        />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-60 p-2">
                <div
                    role="group"
                    aria-label={filter.label}
                    className="grid max-h-64 gap-0.5 overflow-y-auto"
                >
                    {options.map((option) => (
                        <label
                            key={option.value}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                        >
                            <Checkbox
                                checked={values.includes(option.value)}
                                onCheckedChange={(checked) =>
                                    onSet(
                                        checked === true
                                            ? [...values, option.value]
                                            : values.filter(
                                                  (value) =>
                                                      value !== option.value,
                                              ),
                                    )
                                }
                            />
                            <span>{option.label}</span>
                        </label>
                    ))}
                </div>
                {count > 0 ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1 w-full"
                        onClick={() => onSet([])}
                    >
                        {t('core.actions.clear')}
                    </Button>
                ) : null}
            </PopoverContent>
        </Popover>
    );
}

function FilterControl({
    filter,
    values,
    onSet,
    stacked,
}: {
    filter: FilterDefinition;
    values: FilterValues;
    onSet: (changes: FilterValues) => void;
    stacked: boolean;
}) {
    let control: ReactNode;
    switch (filter.type) {
        case 'search':
            control = (
                <SearchControl
                    filter={filter}
                    value={single(values, filter.key) ?? ''}
                    onCommit={(value) =>
                        onSet({ [filter.key]: value || undefined })
                    }
                    className={cn(
                        stacked ? 'w-full' : 'w-full md:w-64',
                        filter.className,
                    )}
                />
            );
            break;
        case 'select':
        case 'boolean':
            control = (
                <SelectControl
                    filter={filter}
                    value={single(values, filter.key)}
                    onSet={(value) => onSet({ [filter.key]: value })}
                    stacked={stacked}
                />
            );
            break;
        case 'multiselect':
            control = (
                <MultiSelectControl
                    filter={filter}
                    values={list(values, filter.key)}
                    onSet={(next) =>
                        onSet({
                            [filter.key]: next.length > 0 ? next : undefined,
                        })
                    }
                    stacked={stacked}
                />
            );
            break;
        case 'date':
            control = (
                <DateInput
                    value={single(values, filter.key) ?? ''}
                    aria-label={filter.label}
                    onChange={(event) =>
                        onSet({ [filter.key]: event.target.value || undefined })
                    }
                    className={cn(
                        stacked ? 'w-full' : 'w-full md:w-44',
                        filter.className,
                    )}
                />
            );
            break;
        case 'daterange': {
            const [fromKey, toKey] = rangeKeys(filter);
            control = (
                <div
                    className={cn(
                        'flex w-full items-center gap-2',
                        !stacked && 'md:w-auto',
                        filter.className,
                    )}
                >
                    <DateInput
                        value={single(values, fromKey) ?? ''}
                        aria-label={`${filter.label} – ${t('ui.filters.from')}`}
                        max={single(values, toKey) || undefined}
                        onChange={(event) =>
                            onSet({
                                [fromKey]: event.target.value || undefined,
                            })
                        }
                        className="flex-1 md:w-40"
                    />
                    <span className="text-muted-foreground" aria-hidden="true">
                        –
                    </span>
                    <DateInput
                        value={single(values, toKey) ?? ''}
                        aria-label={`${filter.label} – ${t('ui.filters.to')}`}
                        min={single(values, fromKey) || undefined}
                        onChange={(event) =>
                            onSet({ [toKey]: event.target.value || undefined })
                        }
                        className="flex-1 md:w-40"
                    />
                </div>
            );
            break;
        }
    }
    if (!stacked) {
        return control;
    }
    return (
        <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
                {filter.label}
            </span>
            {control}
        </div>
    );
}

type FiltersBarProps = {
    filters: FilterDefinition[];
    /** Current values. Defaults to the URL query (read through `useQueryState`). */
    values?: FilterValues;
    /**
     * Called with the full next value set. Defaults to an Inertia GET on the current path
     * (`preserveState`, `preserveScroll`, `replace`) with `page` reset.
     */
    onChange?: (values: FilterValues) => void;
    /** Extra controls at the inline-end of the bar (export/create buttons). */
    children?: ReactNode;
    hideReset?: boolean;
    className?: string;
};

/**
 * URL-driven filter bar: search (debounced 400ms), selects, multiselects, dates and
 * booleans, with active-filter chips and a reset button. On mobile the non-search
 * controls live in a bottom drawer and are applied together.
 */
export function FiltersBar({
    filters,
    values: controlledValues,
    onChange,
    children,
    hideReset = false,
    className,
}: FiltersBarProps) {
    const query = useQueryState();
    const isMobile = useIsMobile();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [pending, setPending] = useState<FilterValues>({});

    const keys = filters.flatMap(filterKeys);
    const values: FilterValues =
        controlledValues ??
        Object.fromEntries(keys.map((key) => [key, query.query[key]]));

    const emit = (next: FilterValues) => {
        if (onChange) {
            onChange(next);
            return;
        }
        const changes: Record<string, QueryValue> = {};
        for (const key of keys) {
            changes[key] = next[key] ?? null;
        }
        query.patch(changes);
    };
    const set = (changes: FilterValues) => emit({ ...values, ...changes });
    const clearFilter = (filter: FilterDefinition) =>
        set(
            Object.fromEntries(
                filterKeys(filter).map((key) => [key, undefined]),
            ),
        );

    const active = filters.filter((filter) => isFilterActive(filter, values));
    const searchFilters = filters.filter((filter) => filter.type === 'search');
    const otherFilters = filters.filter((filter) => filter.type !== 'search');
    const drawerActiveCount = active.filter(
        (filter) => filter.type !== 'search',
    ).length;

    const applyDrawer = () => {
        const next: FilterValues = {};
        for (const filter of searchFilters) {
            next[filter.key] = values[filter.key];
        }
        for (const key of otherFilters.flatMap(filterKeys)) {
            next[key] = pending[key];
        }
        emit(next);
        setDrawerOpen(false);
    };

    const chips =
        active.length > 0 ? (
            <ul
                className="flex flex-wrap items-center gap-1.5"
                aria-label={t('ui.filters.active_filters')}
            >
                {active.map((filter) => (
                    <li key={filter.key}>
                        <Badge
                            variant="secondary"
                            className="gap-1 pe-1 font-normal"
                        >
                            <span className="text-muted-foreground">
                                {filter.label}:
                            </span>
                            <span className="max-w-48 truncate">
                                {describeFilter(filter, values)}
                            </span>
                            <button
                                type="button"
                                onClick={() => clearFilter(filter)}
                                aria-label={t('ui.filters.clear', {
                                    label: filter.label,
                                })}
                                className="ms-0.5 rounded-sm p-0.5 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring/60"
                            >
                                <X className="size-3" aria-hidden="true" />
                            </button>
                        </Badge>
                    </li>
                ))}
            </ul>
        ) : null;

    const resetButton =
        !hideReset && active.length > 0 ? (
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => emit({})}
            >
                {t('core.actions.reset')}
            </Button>
        ) : null;

    if (isMobile) {
        return (
            <div
                className={cn('flex flex-col gap-2', className)}
                data-slot="filters-bar"
            >
                <div className="flex items-center gap-2">
                    {searchFilters.map((filter) => (
                        <FilterControl
                            key={filter.key}
                            filter={filter}
                            values={values}
                            onSet={set}
                            stacked={false}
                        />
                    ))}
                    {otherFilters.length > 0 ? (
                        <Drawer
                            open={drawerOpen}
                            onOpenChange={(open) => {
                                if (open) {
                                    setPending(values);
                                }
                                setDrawerOpen(open);
                            }}
                        >
                            <DrawerTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="shrink-0"
                                    aria-label={t('ui.filters.open')}
                                >
                                    <Filter
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('ui.filters.title')}
                                    {drawerActiveCount > 0 ? (
                                        <Badge className="px-1.5">
                                            {drawerActiveCount}
                                        </Badge>
                                    ) : null}
                                </Button>
                            </DrawerTrigger>
                            <DrawerContent>
                                <DrawerHeader>
                                    <DrawerTitle>
                                        {t('ui.filters.title')}
                                    </DrawerTitle>
                                    <DrawerDescription className="sr-only">
                                        {t('core.states.try_adjust_filters')}
                                    </DrawerDescription>
                                </DrawerHeader>
                                <div className="grid gap-4 px-4 pb-4">
                                    {otherFilters.map((filter) => (
                                        <FilterControl
                                            key={filter.key}
                                            filter={filter}
                                            values={pending}
                                            onSet={(changes) =>
                                                setPending((prev) => ({
                                                    ...prev,
                                                    ...changes,
                                                }))
                                            }
                                            stacked
                                        />
                                    ))}
                                </div>
                                <DrawerFooter>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setPending({})}
                                    >
                                        {t('core.actions.reset')}
                                    </Button>
                                    <Button type="button" onClick={applyDrawer}>
                                        {t('ui.filters.apply')}
                                    </Button>
                                </DrawerFooter>
                            </DrawerContent>
                        </Drawer>
                    ) : null}
                    {children}
                </div>
                {chips ? (
                    <div className="flex flex-wrap items-center gap-2">
                        {chips}
                        {resetButton}
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <div
            className={cn('flex flex-col gap-2', className)}
            data-slot="filters-bar"
        >
            <div className="flex flex-wrap items-center gap-2">
                {filters.map((filter) => (
                    <FilterControl
                        key={filter.key}
                        filter={filter}
                        values={values}
                        onSet={set}
                        stacked={false}
                    />
                ))}
                {resetButton}
                {children ? (
                    <div className="ms-auto flex items-center gap-2">
                        {children}
                    </div>
                ) : null}
            </div>
            {chips}
        </div>
    );
}
