import { Head, Link } from '@inertiajs/react';
import { Plus } from 'lucide-react';
import type { DataTableColumn } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import type { FilterDefinition } from '@/components/shared/filters-bar';
import { FiltersBar, useQueryState } from '@/components/shared/filters-bar';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AdminNotificationsNav } from '@/features/notifications/admin-nav';
import { CampaignStatusBadge } from '@/features/notifications/campaign-status-badge';
import type { Campaign, CampaignStatus, Option } from '@/features/notifications/types';
import { formatNumber } from '@/lib/format';
import { currentLocale, t } from '@/lib/i18n';
import { create, index, show } from '@/routes/admin/notifications';
import type { Paginated } from '@/types/pagination';

type Props = {
    campaigns: Paginated<Campaign>;
    filters: { status?: string; search?: string };
    statuses: Option[];
    counts: Record<CampaignStatus, number>;
    canManage: boolean;
};

export default function AnnouncementsIndex({ campaigns, filters, statuses, counts, canManage }: Props) {
    const query = useQueryState();
    const filterDefinitions: FilterDefinition[] = [
        { key: 'search', type: 'search', label: t('notifications.admin.filters.search'), placeholder: t('notifications.admin.filters.search') },
        { key: 'status', type: 'select', label: t('notifications.admin.filters.status'), options: statuses.map((s) => ({ value: s.value, label: `${s.label} (${formatNumber(counts[s.value as CampaignStatus] ?? 0, 0)})` })) },
    ];

    const columns: DataTableColumn<Campaign>[] = [
        {
            key: 'title',
            header: t('notifications.admin.campaign'),
            required: true,
            cell: (row) => (
                <div className="min-w-0">
                    <Link href={show.url(row.id)} className="font-medium hover:underline">
                        {row.title}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-muted-foreground">
                        <span>{row.category_label}</span>
                        {row.is_marketing ? (
                            <Badge variant="outline" className="text-[10px] font-normal">
                                {t('notifications.admin.fields.marketing')}
                            </Badge>
                        ) : null}
                    </div>
                </div>
            ),
        },
        { key: 'status', header: t('notifications.admin.fields.status'), cell: (row) => <CampaignStatusBadge status={row.status} label={row.status_label} /> },
        { key: 'audience', header: t('notifications.admin.audience_summary'), cell: (row) => <span className="text-sm">{row.audience_summary}</span> },
        { key: 'channels', header: t('notifications.admin.fields.channels'), hideOnMobile: true, cell: (row) => <span className="text-sm text-muted-foreground">{row.channel_labels.join(currentLocale() === 'ar' ? '، ' : ', ')}</span> },
        {
            key: 'progress',
            header: t('notifications.admin.progress'),
            align: 'end',
            cell: (row) =>
                row.recipients_count > 0 ? (
                    <span className="text-sm tabular-nums">
                        {formatNumber(row.sent_count, 0)} / {formatNumber(row.recipients_count, 0)}
                        {row.failed_count > 0 ? <span className="ms-1 text-danger">({formatNumber(row.failed_count, 0)})</span> : null}
                    </span>
                ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                ),
        },
        {
            key: 'when',
            header: t('core.labels.date'),
            hideOnMobile: true,
            cell: (row) => (
                <div className="text-sm">
                    <DateTime value={row.status === 'scheduled' ? row.scheduled_at : (row.finished_at ?? row.created_at)} />
                    {row.created_by ? <div className="text-xs text-muted-foreground">{row.created_by}</div> : null}
                </div>
            ),
        },
    ];

    const filtered = Boolean(filters.status || filters.search);

    return (
        <>
            <Head title={t('notifications.admin.title')} />
            <div className="space-y-4">
                <PageHeader
                    title={t('notifications.admin.title')}
                    description={t('notifications.admin.description')}
                    actions={
                        canManage ? (
                            <Button asChild>
                                <Link href={create.url()} prefetch>
                                    <Plus aria-hidden="true" />
                                    {t('notifications.admin.new_campaign')}
                                </Link>
                            </Button>
                        ) : null
                    }
                />
                <AdminNotificationsNav current="campaigns" />
                {!canManage ? <InlineAlert tone="info">{t('notifications.admin.read_only')}</InlineAlert> : null}
                <DataTable
                    id="admin-notifications-campaigns"
                    columns={columns}
                    data={campaigns}
                    rowKey="id"
                    rowHref={(row) => show.url(row.id)}
                    toolbar={<FiltersBar filters={filterDefinitions} />}
                    filtered={filtered}
                    onResetFilters={() => query.reset()}
                    emptyTitle={t('notifications.admin.empty')}
                    emptyDescription={t('notifications.admin.empty_hint')}
                    emptyAction={
                        canManage ? (
                            <Button asChild>
                                <Link href={create.url()}>{t('notifications.admin.new_campaign')}</Link>
                            </Button>
                        ) : undefined
                    }
                    caption={t('notifications.admin.title')}
                    mobileTitle={(row) => row.title}
                />
            </div>
        </>
    );
}

AnnouncementsIndex.layout = () => ({ breadcrumbs: [{ title: t('notifications.admin.title'), href: index.url() }] });
