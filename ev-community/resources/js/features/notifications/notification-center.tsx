import { Head, Link, router } from '@inertiajs/react';
import {
    Bell,
    BellRing,
    Check,
    CheckCheck,
    ExternalLink,
    Settings2,
} from 'lucide-react';
import { useState } from 'react';
import { useInertiaLoading } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import { EmptyState, NoResults } from '@/components/shared/empty-state';
import type { FilterDefinition } from '@/components/shared/filters-bar';
import { FiltersBar, useQueryState } from '@/components/shared/filters-bar';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { SkeletonCards } from '@/components/shared/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import type {
    NotificationCenterEndpoints,
    NotificationCenterProps,
    NotificationItem,
} from '@/features/notifications/types';
import { useUnreadCount } from '@/features/notifications/use-unread-count';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = NotificationCenterProps & {
    title: string;
    description: string;
    endpoints: NotificationCenterEndpoints;
};

/**
 * The notification center shared by the member portal, the admin inbox and the partner portal.
 * Server-driven: filters and pages are query params; "read" state changes go through POST endpoints
 * that only ever touch the signed-in user's own notifications.
 */
export function NotificationCenter({
    notifications,
    filters,
    categories,
    unreadCount,
    preferencesUrl,
    title,
    description,
    endpoints,
}: Props) {
    const loading = useInertiaLoading();
    const query = useQueryState();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [markingAll, setMarkingAll] = useState(false);
    const polledUnread = useUnreadCount(endpoints.unreadCount, unreadCount);
    const hasNew = polledUnread > unreadCount;

    const filterDefinitions: FilterDefinition[] = [
        {
            key: 'category',
            type: 'select',
            label: t('notifications.center.category'),
            options: categories,
        },
        {
            key: 'unread',
            type: 'boolean',
            label: t('notifications.center.unread_only'),
        },
    ];
    const filtered = Boolean(filters.category) || filters.unread;
    const rows = notifications.data;

    const open = (item: NotificationItem) => {
        if (item.is_read && !item.url) {
            return;
        }
        setBusyId(item.id);
        router.post(
            endpoints.read(item.id),
            { open: item.url ? 1 : 0 },
            {
                preserveScroll: true,
                preserveState: !item.url,
                onFinish: () => setBusyId(null),
            },
        );
    };

    const markRead = (item: NotificationItem) => {
        setBusyId(item.id);
        router.post(
            endpoints.read(item.id),
            {},
            {
                preserveScroll: true,
                only: ['notifications', 'unreadCount', 'unreadNotifications'],
                onFinish: () => setBusyId(null),
            },
        );
    };

    const markAll = () => {
        setMarkingAll(true);
        router.post(
            endpoints.readAll,
            filters.category ? { category: filters.category } : {},
            { preserveScroll: true, onFinish: () => setMarkingAll(false) },
        );
    };

    return (
        <>
            <Head title={title} />
            <div className="space-y-4">
                <PageHeader
                    title={title}
                    description={description}
                    actions={
                        <>
                            <Button
                                variant="outline"
                                onClick={markAll}
                                disabled={unreadCount === 0 || markingAll}
                                data-test="mark-all-read"
                            >
                                {markingAll ? (
                                    <Spinner />
                                ) : (
                                    <CheckCheck aria-hidden="true" />
                                )}
                                {t('notifications.center.mark_all_read')}
                            </Button>
                            {preferencesUrl ? (
                                <Button variant="ghost" asChild>
                                    <Link href={preferencesUrl} prefetch>
                                        <Settings2 aria-hidden="true" />
                                        {t('notifications.center.settings')}
                                    </Link>
                                </Button>
                            ) : null}
                        </>
                    }
                >
                    {unreadCount > 0 ? (
                        <Badge
                            variant="secondary"
                            className="mt-2"
                            aria-live="polite"
                        >
                            {t('notifications.center.unread_count', {
                                count: formatNumber(unreadCount, 0),
                            })}
                        </Badge>
                    ) : null}
                </PageHeader>

                {hasNew ? (
                    <InlineAlert
                        tone="info"
                        icon={BellRing}
                        action={
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                    router.reload({
                                        only: [
                                            'notifications',
                                            'unreadCount',
                                            'unreadNotifications',
                                        ],
                                    })
                                }
                            >
                                {t('notifications.center.refresh')}
                            </Button>
                        }
                    >
                        {t('notifications.center.new_available')}
                    </InlineAlert>
                ) : null}

                <div
                    role="search"
                    aria-label={t('notifications.center.filter_label')}
                >
                    <FiltersBar filters={filterDefinitions} />
                </div>

                {loading ? (
                    <SkeletonCards count={4} />
                ) : rows.length === 0 ? (
                    filtered ? (
                        <NoResults onReset={() => query.reset()} />
                    ) : (
                        <EmptyState
                            icon={Bell}
                            title={t('notifications.center.empty')}
                            description={t('notifications.center.empty_hint')}
                        />
                    )
                ) : (
                    <Card className="gap-0 overflow-hidden py-0 shadow-card">
                        <ul
                            aria-label={t('notifications.center.list_label')}
                            className="divide-y"
                        >
                            {rows.map((item) => (
                                <li
                                    key={item.id}
                                    className={cn(
                                        'flex items-start gap-3 px-4 py-3 md:px-5',
                                        !item.is_read && 'bg-brand-soft/30',
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'mt-2 size-2 shrink-0 rounded-full',
                                            item.is_read
                                                ? 'bg-transparent'
                                                : 'bg-brand',
                                        )}
                                        aria-label={
                                            item.is_read
                                                ? undefined
                                                : t(
                                                      'notifications.center.unread_badge',
                                                  )
                                        }
                                        role={item.is_read ? undefined : 'img'}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => open(item)}
                                        disabled={busyId === item.id}
                                        className={cn(
                                            'min-w-0 flex-1 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                                            (item.url || !item.is_read) &&
                                                'cursor-pointer',
                                            item.is_read &&
                                                !item.url &&
                                                'cursor-default',
                                        )}
                                    >
                                        <span className="flex flex-wrap items-center gap-2">
                                            <Badge
                                                variant="outline"
                                                className="text-[11px] font-normal"
                                            >
                                                {item.category_label}
                                            </Badge>
                                            <DateTime
                                                value={item.created_at}
                                                mode="relative"
                                                className="text-xs text-muted-foreground"
                                            />
                                            {item.url ? (
                                                <ExternalLink
                                                    className="size-3.5 text-muted-foreground rtl:-scale-x-100"
                                                    aria-hidden="true"
                                                />
                                            ) : null}
                                        </span>
                                        <span
                                            className={cn(
                                                'mt-1 block text-sm',
                                                item.is_read
                                                    ? 'font-normal text-foreground/80'
                                                    : 'font-semibold',
                                            )}
                                        >
                                            {item.title}
                                        </span>
                                        {item.body ? (
                                            <span className="mt-0.5 line-clamp-3 block text-sm whitespace-pre-line text-muted-foreground">
                                                {item.body}
                                            </span>
                                        ) : null}
                                    </button>
                                    {!item.is_read ? (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="shrink-0"
                                            onClick={() => markRead(item)}
                                            disabled={busyId === item.id}
                                            aria-label={t(
                                                'notifications.center.mark_read',
                                            )}
                                            title={t(
                                                'notifications.center.mark_read',
                                            )}
                                        >
                                            {busyId === item.id ? (
                                                <Spinner />
                                            ) : (
                                                <Check aria-hidden="true" />
                                            )}
                                        </Button>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </Card>
                )}

                <Pagination data={notifications} />
            </div>
        </>
    );
}
