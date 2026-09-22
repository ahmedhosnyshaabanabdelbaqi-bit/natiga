import { router } from '@inertiajs/react';
import type { LucideIcon } from 'lucide-react';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandLoading,
    CommandShortcut,
} from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type CommandAction =
    | { href: string; onSelect?: never }
    | { href?: never; onSelect: () => void };

export type CommandPaletteItem = {
    /** Stable id (defaults to the label + target). */
    id?: string;
    label: string;
    /** Secondary text (record number, section, shortcut). */
    hint?: string;
    icon?: LucideIcon;
    /** Extra words that should match this item (e.g. English synonyms, SKU). */
    keywords?: string[];
} & CommandAction;

export type CommandPaletteGroup = {
    heading: string;
    items: CommandPaletteItem[];
};

export type CommandPaletteProps = {
    /** Static entries (pages, actions). Filtered locally as the user types. */
    groups: CommandPaletteGroup[];
    /**
     * Server search for records. Called (debounced) once the query has `minSearchLength` characters;
     * the signal aborts when the query changes. Results are shown as returned (no local filtering).
     */
    search?: (
        query: string,
        signal: AbortSignal,
    ) => Promise<CommandPaletteGroup[]>;
    minSearchLength?: number;
    /** Controlled open state (optional). */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Listen for Ctrl/Cmd+K globally (default true). Mount one palette per page. */
    shortcut?: boolean;
    /** Render the default search trigger button (default true). */
    trigger?: boolean;
    placeholder?: string;
    className?: string;
};

export const COMMAND_SEARCH_DEBOUNCE_MS = 250;

function normalize(value: string): string {
    // Case-insensitive, and ignores Arabic diacritics/tatweel so "مُحرّك" matches "محرك".
    return value
        .toLocaleLowerCase()
        .normalize('NFKD')
        .replace(/\p{Mn}|\u0640/gu, '')
        .trim();
}

function itemMatches(item: CommandPaletteItem, query: string): boolean {
    const needle = normalize(query);
    if (needle === '') {
        return true;
    }
    return [item.label, item.hint ?? '', ...(item.keywords ?? [])].some(
        (text) => normalize(text).includes(needle),
    );
}

function itemKey(item: CommandPaletteItem, group: string): string {
    return item.id ?? `${group}:${item.label}:${item.href ?? ''}`;
}

function isMac(): boolean {
    return (
        typeof navigator !== 'undefined' &&
        /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    );
}

/**
 * Ctrl/Cmd+K command palette (cmdk inside a dialog): static page/action groups plus optional
 * async record search. Arrow keys move, Enter selects, Escape closes.
 */
export function CommandPalette({
    groups,
    search,
    minSearchLength = 2,
    open: controlledOpen,
    onOpenChange,
    shortcut = true,
    trigger = true,
    placeholder,
    className,
}: CommandPaletteProps) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const open = controlledOpen ?? uncontrolledOpen;
    const [query, setQuery] = useState('');
    const [remote, setRemote] = useState<CommandPaletteGroup[]>([]);
    const [searching, setSearching] = useState(false);
    const [failed, setFailed] = useState(false);
    const searchRef = useRef(search);

    useEffect(() => {
        searchRef.current = search;
    }, [search]);

    const setOpen = (next: boolean) => {
        if (controlledOpen === undefined) {
            setUncontrolledOpen(next);
        }
        onOpenChange?.(next);
        if (!next) {
            setQuery('');
            setRemote([]);
            setFailed(false);
        }
    };
    const setOpenRef = useRef(setOpen);
    useEffect(() => {
        setOpenRef.current = setOpen;
    });

    useEffect(() => {
        if (!shortcut) {
            return;
        }
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (
                event.key.toLowerCase() === 'k' &&
                (event.metaKey || event.ctrlKey) &&
                !event.altKey &&
                !event.defaultPrevented
            ) {
                event.preventDefault();
                setOpenRef.current(!open);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [shortcut, open]);

    // Debounced server search; each new query aborts the previous request.
    useEffect(() => {
        const run = searchRef.current;
        const text = query.trim();
        if (!open || !run || text.length < minSearchLength) {
            setRemote([]);
            setSearching(false);
            setFailed(false);
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setSearching(true);
            setFailed(false);
            run(text, controller.signal)
                .then((result) => {
                    if (!controller.signal.aborted) {
                        setRemote(result);
                    }
                })
                .catch(() => {
                    if (!controller.signal.aborted) {
                        setRemote([]);
                        setFailed(true);
                    }
                })
                .finally(() => {
                    if (!controller.signal.aborted) {
                        setSearching(false);
                    }
                });
        }, COMMAND_SEARCH_DEBOUNCE_MS);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [query, open, minSearchLength]);

    const localGroups = useMemo(
        () =>
            groups
                .map((group) => ({
                    ...group,
                    items: group.items.filter((item) =>
                        itemMatches(item, query),
                    ),
                }))
                .filter((group) => group.items.length > 0),
        [groups, query],
    );
    const remoteGroups = remote.filter((group) => group.items.length > 0);
    const nothing =
        localGroups.length === 0 && remoteGroups.length === 0 && !searching;

    const select = (item: CommandPaletteItem) => {
        setOpen(false);
        if (item.href !== undefined) {
            router.visit(item.href);
        } else {
            item.onSelect();
        }
    };

    const renderGroup = (group: CommandPaletteGroup, prefix: string) => (
        <CommandGroup
            key={`${prefix}:${group.heading}`}
            heading={group.heading}
        >
            {group.items.map((item) => {
                const key = itemKey(item, `${prefix}:${group.heading}`);
                const Icon = item.icon;
                return (
                    <CommandItem
                        key={key}
                        value={key}
                        onSelect={() => select(item)}
                    >
                        {Icon ? <Icon aria-hidden="true" /> : null}
                        <span className="min-w-0 flex-1 truncate">
                            {item.label}
                        </span>
                        {item.hint ? (
                            <CommandShortcut
                                className="tracking-normal"
                                dir="auto"
                            >
                                {item.hint}
                            </CommandShortcut>
                        ) : null}
                    </CommandItem>
                );
            })}
        </CommandGroup>
    );

    return (
        <>
            {trigger ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                        'justify-between gap-3 text-muted-foreground',
                        className,
                    )}
                    onClick={() => setOpen(true)}
                    aria-keyshortcuts={
                        shortcut ? 'Control+K Meta+K' : undefined
                    }
                >
                    <span className="flex items-center gap-2">
                        <Search className="size-4" aria-hidden="true" />
                        {t('ui.command.open')}
                    </span>
                    {shortcut ? (
                        <Kbd
                            className="hidden sm:inline-flex"
                            dir="ltr"
                            aria-label={t('ui.command.shortcut')}
                        >
                            {isMac() ? '⌘K' : 'Ctrl K'}
                        </Kbd>
                    ) : null}
                </Button>
            ) : null}
            <CommandDialog
                open={open}
                onOpenChange={setOpen}
                title={t('ui.command.title')}
                description={t('ui.command.description')}
                commandProps={{ shouldFilter: false, loop: true }}
            >
                <CommandInput
                    value={query}
                    onValueChange={setQuery}
                    placeholder={placeholder ?? t('ui.command.placeholder')}
                />
                <CommandList>
                    {searching ? (
                        <CommandLoading>
                            {t('ui.command.searching')}
                        </CommandLoading>
                    ) : null}
                    {failed ? (
                        <p
                            role="alert"
                            className="px-3 py-2 text-sm text-danger"
                        >
                            {t('ui.command.error')}
                        </p>
                    ) : null}
                    {nothing && !failed ? (
                        <CommandEmpty>
                            {t('ui.command.no_results')}
                        </CommandEmpty>
                    ) : null}
                    {localGroups.map((group) => renderGroup(group, 'local'))}
                    {remoteGroups.map((group) => renderGroup(group, 'remote'))}
                </CommandList>
            </CommandDialog>
        </>
    );
}
