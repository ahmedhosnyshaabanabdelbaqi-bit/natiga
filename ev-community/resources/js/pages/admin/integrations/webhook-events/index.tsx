import { Head, Link, router } from '@inertiajs/react';
import { ExternalLink, Webhook } from 'lucide-react';
import { useState } from 'react';
import type { DataTableColumn } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import { EmptyState } from '@/components/shared/empty-state';
import type {
    FilterDefinition,
    FilterValues,
} from '@/components/shared/filters-bar';
import { FiltersBar } from '@/components/shared/filters-bar';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { useQueryState } from '@/components/shared/use-query-state';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { t, useLocale } from '@/lib/i18n';
import { index as integrationsIndex } from '@/routes/admin/integrations';
import {
    index as webhookEventsIndex,
    show as webhookEventShow,
} from '@/routes/admin/integrations/webhook-events';
import {
    SignatureBadge,
    WebhookStatusBadge,
} from '@/features/integrations/badges';
import { IntegrationsTabs } from '@/features/integrations/integrations-tabs';
import { RetryWebhookButton } from '@/features/integrations/retry-webhook-button';
import type {
    WebhookEventDetail,
    WebhookEventRow,
    WebhookEventsIndexProps,
} from '@/features/integrations/types';
import { useListLoading } from '@/features/integrations/use-list-loading';
import { WebhookEventDetailBody } from '@/features/integrations/webhook-event-detail';

const FILTER_KEYS = ['provider', 'status', 'q'] as const;

function EventDrawer({
    selected,
    requestedId,
    loading,
    canManage,
    onClose,
}: {
    selected: WebhookEventDetail | null;
    requestedId: number | null;
    loading: boolean;
    canManage: boolean;
    onClose: () => void;
}) {
    const { isRtl } = useLocale();
    const open = requestedId !== null;
    const event = selected && selected.id === requestedId ? selected : null;

    return (
        <Sheet
            open={open}
            onOpenChange={(next) => {
                if (!next) {
                    onClose();
                }
            }}
        >
            <SheetContent
                side={isRtl ? 'left' : 'right'}
                className="w-full overflow-y-auto sm:max-w-xl"
            >
                <SheetHeader className="border-b text-start">
                    <SheetTitle className="pe-6">
                        {t('integrations.webhooks.detail_title', {
                            id: requestedId ?? '',
                        })}
                    </SheetTitle>
                    <SheetDescription>
                        {event
                            ? t(`integrations.categories.${event.provider}`)
                            : t('integrations.webhooks.drawer_description')}
                    </SheetDescription>
                </SheetHeader>
                <div className="px-4 pb-4">
                    {loading && !event ? (
                        <div className="space-y-3" aria-busy="true">
                            <span className="sr-only">
                                {t('core.states.loading')}
                            </span>
                            <Skeleton className="h-4 w-2/3" />
                            <Skeleton className="h-4 w-1/2" />
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-40 w-full" />
                        </div>
                    ) : event ? (
                        <WebhookEventDetailBody event={event} />
                    ) : (
                        <InlineAlert tone="warning">
                            {t('integrations.webhooks.not_found')}
                        </InlineAlert>
                    )}
                </div>
                {event ? (
                    <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t">
                        <Button asChild variant="ghost" size="sm">
                            <Link href={webhookEventShow.url(event.id)}>
                                <ExternalLink
                                    aria-hidden="true"
                                    className="rtl:-scale-x-100"
                                />
                                {t('integrations.webhooks.open_full_page')}
                            </Link>
                        </Button>
                        <RetryWebhookButton
                            event={event}
                            canManage={canManage}
                        />
                    </SheetFooter>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

export default function WebhookEventsIndex({
    events,
    filters,
    providers,
    statuses,
    selected = null,
    canManage,
}: WebhookEventsIndexProps) {
    const query = useQueryState();
    const listLoading = useListLoading();
    const [drawerLoading, setDrawerLoading] = useState(false);

    const requestedParam = query.get('event');
    const requestedId =
        requestedParam && /^\d+$/.test(requestedParam)
            ? Number(requestedParam)
            : null;

    const openEvent = (id: number) => {
        router.visit(query.href({ event: String(id) }), {
            only: ['selected'],
            preserveState: true,
            preserveScroll: true,
            onStart: () => setDrawerLoading(true),
            onFinish: () => setDrawerLoading(false),
        });
    };
    const closeEvent = () =>
        query.remove(['event'], {
            only: ['selected'],
            resetPage: false,
            replace: false,
        });

    const filterDefinitions: FilterDefinition[] = [
        {
            key: 'q',
            type: 'search',
            label: t('integrations.webhooks.filters.search'),
            placeholder: t('integrations.webhooks.filters.search'),
            className: 'w-full md:w-72',
        },
        {
            key: 'provider',
            type: 'select',
            label: t('integrations.webhooks.filters.provider'),
            options: providers.map((provider) => ({
                value: provider,
                label: t(`integrations.categories.${provider}`),
            })),
        },
        {
            key: 'status',
            type: 'select',
            label: t('integrations.webhooks.filters.status'),
            options: statuses.map((status) => ({
                value: status,
                label: t(`integrations.webhooks.status.${status}`),
            })),
        },
    ];
    const filterValues: FilterValues = {
        q: filters.q ?? undefined,
        provider: filters.provider ?? undefined,
        status: filters.status ?? undefined,
    };
    const filtered = FILTER_KEYS.some((key) => Boolean(filters[key]));
    const applyFilters = (next: FilterValues) => {
        const changes: Record<string, string | null> = { event: null };
        for (const key of FILTER_KEYS) {
            const value = next[key];
            changes[key] =
                typeof value === 'string' && value !== '' ? value : null;
        }
        query.patch(changes);
    };

    const columns: DataTableColumn<WebhookEventRow>[] = [
        {
            key: 'received_at',
            header: t('integrations.webhooks.columns.received_at'),
            cell: (row) => <DateTime value={row.received_at} />,
        },
        {
            key: 'provider',
            header: t('integrations.webhooks.columns.provider'),
            cell: (row) => (
                <div>
                    <p>{t(`integrations.categories.${row.provider}`)}</p>
                    {row.driver ? (
                        <Code className="mt-0.5 text-[0.75rem]">
                            {row.driver}
                        </Code>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'event_type',
            header: t('integrations.webhooks.columns.event_type'),
            cell: (row) =>
                row.event_type ? (
                    <Code>{row.event_type}</Code>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: 'external_event_id',
            header: t('integrations.webhooks.columns.external_id'),
            hideOnMobile: true,
            cell: (row) =>
                row.external_event_id ? (
                    <Code className="max-w-48 truncate align-bottom">
                        {row.external_event_id}
                    </Code>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: 'signature',
            header: t('integrations.webhooks.columns.signature'),
            cell: (row) => <SignatureBadge valid={row.signature_valid} />,
        },
        {
            key: 'status',
            header: t('integrations.webhooks.columns.status'),
            required: true,
            cell: (row) => <WebhookStatusBadge status={row.status} />,
        },
        {
            key: 'retry_count',
            header: t('integrations.webhooks.columns.retries'),
            align: 'end',
            hideOnMobile: true,
            cell: (row) => <span className="tabular">{row.retry_count}</span>,
        },
        {
            key: 'error',
            header: t('integrations.webhooks.columns.error'),
            className: 'whitespace-normal',
            cell: (row) =>
                row.error_short ? (
                    <p
                        className="line-clamp-2 max-w-xs text-xs break-words text-danger"
                        title={row.error_short}
                    >
                        {row.error_short}
                    </p>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: 'processed_at',
            header: t('integrations.webhooks.columns.processed_at'),
            defaultHidden: true,
            hideOnMobile: true,
            cell: (row) => <DateTime value={row.processed_at} />,
        },
        {
            key: 'actions',
            header: (
                <span className="sr-only">
                    {t('integrations.columns.actions')}
                </span>
            ),
            required: true,
            align: 'end',
            cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                    {row.can_retry ? (
                        <RetryWebhookButton event={row} canManage={canManage} />
                    ) : null}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openEvent(row.id)}
                        aria-label={t('integrations.webhooks.view_event', {
                            id: row.id,
                        })}
                    >
                        {t('integrations.actions.view')}
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <>
            <Head title={t('integrations.webhooks.title')} />
            <div className="space-y-6">
                <PageHeader
                    title={t('integrations.webhooks.title')}
                    description={t('integrations.webhooks.description')}
                />
                <IntegrationsTabs current="webhooks" />
                <DataTable<WebhookEventRow>
                    id="integrations-webhook-events"
                    columns={columns}
                    data={events}
                    rowKey="id"
                    loading={listLoading}
                    onRowClick={(row) => openEvent(row.id)}
                    filtered={filtered}
                    onResetFilters={() => applyFilters({})}
                    caption={t('integrations.webhooks.title')}
                    emptyState={
                        filtered ? undefined : (
                            <EmptyState
                                icon={Webhook}
                                title={t('integrations.webhooks.empty')}
                                description={t(
                                    'integrations.webhooks.empty_hint',
                                )}
                            />
                        )
                    }
                    toolbar={
                        <FiltersBar
                            filters={filterDefinitions}
                            values={filterValues}
                            onChange={applyFilters}
                            className="w-full"
                        />
                    }
                    mobileTitle={(row) => (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                                {t(`integrations.categories.${row.provider}`)}{' '}
                                <span className="text-muted-foreground">
                                    #{row.id}
                                </span>
                            </span>
                            <WebhookStatusBadge status={row.status} />
                        </div>
                    )}
                />
            </div>
            <EventDrawer
                selected={selected}
                requestedId={requestedId}
                loading={drawerLoading}
                canManage={canManage}
                onClose={closeEvent}
            />
        </>
    );
}

WebhookEventsIndex.layout = () => ({
    breadcrumbs: [
        { title: t('integrations.title'), href: integrationsIndex.url() },
        {
            title: t('integrations.webhooks.title'),
            href: webhookEventsIndex.url(),
        },
    ],
});
