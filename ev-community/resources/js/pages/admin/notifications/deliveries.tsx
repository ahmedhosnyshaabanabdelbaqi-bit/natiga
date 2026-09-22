import { Head, router } from '@inertiajs/react';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { DataTableColumn } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import type { FilterDefinition } from '@/components/shared/filters-bar';
import { FiltersBar, useQueryState } from '@/components/shared/filters-bar';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import type { StatusTone } from '@/components/shared/status-badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { AdminNotificationsNav } from '@/features/notifications/admin-nav';
import type {
    ChannelOption,
    DeliveryRow,
    Option,
} from '@/features/notifications/types';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import {
    index as deliveriesIndex,
    retry,
} from '@/routes/admin/notifications/deliveries';
import type { Paginated } from '@/types/pagination';

type Props = {
    deliveries: Paginated<DeliveryRow>;
    filters: { status: string; channel?: string; search?: string };
    statuses: Option[];
    channels: ChannelOption[];
    counts24h: Record<string, number>;
    canManage: boolean;
};

const tones: Record<string, StatusTone> = {
    queued: 'warning',
    sent: 'success',
    delivered: 'success',
    read: 'success',
    failed: 'danger',
    skipped: 'muted',
};

export default function NotificationDeliveries({
    deliveries,
    filters,
    statuses,
    channels,
    counts24h,
    canManage,
}: Props) {
    const query = useQueryState();
    const [target, setTarget] = useState<DeliveryRow | null>(null);
    const [processing, setProcessing] = useState(false);

    const filterDefinitions: FilterDefinition[] = [
        {
            key: 'search',
            type: 'search',
            label: t('notifications.deliveries.search'),
            placeholder: t('notifications.deliveries.search'),
        },
        {
            key: 'status',
            type: 'select',
            label: t('notifications.deliveries.status'),
            options: statuses.filter((s) => s.value !== 'read'),
        },
        {
            key: 'channel',
            type: 'select',
            label: t('notifications.deliveries.channel'),
            options: channels.map((c) => ({ value: c.value, label: c.label })),
        },
    ];

    const confirmRetry = () =>
        new Promise<void>((resolve) => {
            if (!target) {
                resolve();
                return;
            }
            setProcessing(true);
            router.post(
                retry.url({
                    notification: target.notification_id,
                    channel: target.channel,
                }),
                {},
                {
                    preserveScroll: true,
                    onFinish: () => {
                        setProcessing(false);
                        setTarget(null);
                        resolve();
                    },
                },
            );
        });

    const columns: DataTableColumn<DeliveryRow>[] = [
        {
            key: 'recipient',
            header: t('notifications.deliveries.recipient'),
            required: true,
            cell: (row) => (
                <div className="min-w-0">
                    <div className="font-medium">{row.recipient ?? '—'}</div>
                    {row.member_number ? (
                        <Code>{row.member_number}</Code>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'notification',
            header: t('notifications.deliveries.notification'),
            cell: (row) => (
                <div className="max-w-xs min-w-0">
                    <div className="truncate text-sm">{row.title}</div>
                    <Code className="text-[11px]">{row.key}</Code>
                </div>
            ),
        },
        {
            key: 'channel',
            header: t('notifications.deliveries.channel'),
            cell: (row) => row.channel_label,
        },
        {
            key: 'status',
            header: t('notifications.deliveries.status'),
            cell: (row) => (
                <StatusBadge
                    status={row.status}
                    label={row.status_label}
                    tone={tones[row.status] ?? 'info'}
                />
            ),
        },
        {
            key: 'reason',
            header: t('notifications.deliveries.reason'),
            hideOnMobile: true,
            cell: (row) => (
                <span className="line-clamp-2 max-w-xs text-xs break-words text-muted-foreground">
                    {row.reason ?? '—'}
                </span>
            ),
        },
        {
            key: 'attempts',
            header: t('notifications.deliveries.attempts'),
            align: 'end',
            hideOnMobile: true,
            cell: (row) => (
                <span className="tabular-nums">
                    {formatNumber(row.attempts, 0)}
                </span>
            ),
        },
        {
            key: 'updated_at',
            header: t('notifications.deliveries.updated_at'),
            hideOnMobile: true,
            cell: (row) => <DateTime value={row.updated_at} />,
        },
        {
            key: 'actions',
            header: <span className="sr-only">{t('core.labels.actions')}</span>,
            align: 'end',
            cell: (row) => {
                if (!canManage || row.status !== 'failed') {
                    return null;
                }
                if (!row.can_retry) {
                    return (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span tabIndex={0}>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled
                                    >
                                        <RotateCcw aria-hidden="true" />
                                        {t('notifications.deliveries.retry')}
                                    </Button>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t(
                                    'notifications.deliveries.not_retryable_hint',
                                )}
                            </TooltipContent>
                        </Tooltip>
                    );
                }
                return (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTarget(row)}
                    >
                        <RotateCcw aria-hidden="true" />
                        {t('notifications.deliveries.retry')}
                    </Button>
                );
            },
        },
    ];

    return (
        <>
            <Head title={t('notifications.deliveries.title')} />
            <div className="space-y-4">
                <PageHeader
                    title={t('notifications.deliveries.title')}
                    description={t('notifications.deliveries.description')}
                />
                <AdminNotificationsNav current="deliveries" />
                <section
                    aria-label={t('notifications.deliveries.last_24h')}
                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                >
                    <StatCard
                        label={`${t('notifications.delivery_status.failed')} · ${t('notifications.deliveries.last_24h')}`}
                        value={formatNumber(counts24h.failed ?? 0, 0)}
                        tone={
                            (counts24h.failed ?? 0) > 0 ? 'danger' : 'default'
                        }
                    />
                    <StatCard
                        label={`${t('notifications.delivery_status.queued')} · ${t('notifications.deliveries.last_24h')}`}
                        value={formatNumber(counts24h.queued ?? 0, 0)}
                        tone="warning"
                    />
                    <StatCard
                        label={`${t('notifications.delivery_status.sent')} · ${t('notifications.deliveries.last_24h')}`}
                        value={formatNumber(counts24h.sent ?? 0, 0)}
                        tone="success"
                    />
                    <StatCard
                        label={`${t('notifications.delivery_status.skipped')} · ${t('notifications.deliveries.last_24h')}`}
                        value={formatNumber(counts24h.skipped ?? 0, 0)}
                    />
                </section>
                <DataTable
                    id="admin-notification-deliveries"
                    columns={columns}
                    data={deliveries}
                    rowKey="id"
                    toolbar={
                        <FiltersBar
                            filters={filterDefinitions}
                            values={{
                                status: filters.status,
                                channel: filters.channel,
                                search: filters.search,
                            }}
                            hideReset={false}
                        />
                    }
                    filtered={Boolean(filters.channel || filters.search)}
                    onResetFilters={() => query.reset()}
                    emptyTitle={t('notifications.deliveries.empty')}
                    emptyDescription={t('notifications.deliveries.empty_hint')}
                    caption={t('notifications.deliveries.title')}
                    mobileTitle={(row) => row.recipient ?? row.key}
                />
            </div>

            <ConfirmDialog
                open={target !== null}
                onOpenChange={(open) => !open && !processing && setTarget(null)}
                title={t('notifications.deliveries.retry_confirm_title')}
                description={t('notifications.deliveries.retry_confirm_text')}
                confirmLabel={t('notifications.deliveries.retry')}
                processing={processing}
                onConfirm={confirmRetry}
            />
        </>
    );
}

NotificationDeliveries.layout = () => ({
    breadcrumbs: [
        {
            title: t('notifications.deliveries.title'),
            href: deliveriesIndex.url(),
        },
    ],
});
