import { Head, Link } from '@inertiajs/react';
import { FileSearch, ShieldAlert } from 'lucide-react';
import type { DataTableColumn } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import type { FilterDefinition } from '@/components/shared/filters-bar';
import {
    FiltersBar,
    isFilterActive,
    useQueryState,
} from '@/components/shared/filters-bar';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { securityEventLabel, severityTone, tOr } from '@/features/system/i18n';
import { MetaSummary } from '@/features/system/meta-summary';
import { can } from '@/lib/auth';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { index as auditIndex } from '@/routes/admin/audit-logs';
import { index as securityIndex } from '@/routes/admin/security-events';
import { show as userShow } from '@/routes/admin/users';
import type { Paginated } from '@/types/pagination';

type SecurityEventListRow = {
    id: number;
    type: string;
    severity: string;
    user: { id: string; name: string; email: string } | null;
    ip_address: string | null;
    user_agent: string | null;
    meta: Record<string, unknown> | null;
    created_at: string | null;
};

type Props = {
    events: Paginated<SecurityEventListRow>;
    filters: Record<string, string | undefined>;
    types: string[];
    criticalCount: number;
};

export default function SecurityEventsIndex({
    events,
    types,
    criticalCount,
}: Props) {
    const query = useQueryState();
    const criticalOnly = query.get('critical') === '1';
    const canViewUsers = can(['users.view', 'users.manage']);

    const filters: FilterDefinition[] = [
        {
            key: 'user',
            type: 'search',
            label: t('audit.security.filters.user'),
            className: 'md:w-60',
        },
        {
            key: 'type',
            type: 'select',
            label: t('audit.security.filters.type'),
            options: types.map((type) => ({
                value: type,
                label: securityEventLabel(type),
            })),
        },
        {
            key: 'severity',
            type: 'select',
            label: t('audit.security.filters.severity'),
            options: ['info', 'warning', 'critical'].map((severity) => ({
                value: severity,
                label: t(`audit.security.severity.${severity}`),
            })),
        },
        {
            key: 'date',
            type: 'daterange',
            label: t('audit.security.filters.date'),
            fromKey: 'from',
            toKey: 'to',
        },
        {
            key: 'critical',
            type: 'boolean',
            label: t('audit.security.filters.critical'),
        },
    ];
    const filtered = filters.some((filter) =>
        isFilterActive(filter, query.query),
    );

    const columns: DataTableColumn<SecurityEventListRow>[] = [
        {
            key: 'created_at',
            header: t('audit.security.columns.created_at'),
            required: true,
            cell: (event) => (
                <DateTime
                    value={event.created_at}
                    className="whitespace-nowrap"
                />
            ),
        },
        {
            key: 'type',
            header: t('audit.security.columns.type'),
            cell: (event) => (
                <span className="grid">
                    <span>{securityEventLabel(event.type)}</span>
                    <Code className="w-fit text-[0.7rem]">{event.type}</Code>
                </span>
            ),
        },
        {
            key: 'severity',
            header: t('audit.security.columns.severity'),
            cell: (event) => (
                <StatusBadge
                    status={event.severity}
                    tone={severityTone(event.severity)}
                    label={tOr(
                        `audit.security.severity.${event.severity}`,
                        event.severity,
                    )}
                />
            ),
        },
        {
            key: 'user',
            header: t('audit.security.columns.user'),
            cell: (event) =>
                event.user ? (
                    <span className="grid">
                        {canViewUsers ? (
                            <Link
                                href={userShow(event.user.id).url}
                                className="font-medium hover:underline"
                            >
                                {event.user.name}
                            </Link>
                        ) : (
                            <span className="font-medium">
                                {event.user.name}
                            </span>
                        )}
                        <span
                            className="text-xs text-muted-foreground"
                            dir="ltr"
                        >
                            {event.user.email}
                        </span>
                    </span>
                ) : (
                    <span className="text-muted-foreground">
                        {t('audit.security.no_user')}
                    </span>
                ),
        },
        {
            key: 'ip_address',
            header: t('audit.security.columns.ip'),
            cell: (event) =>
                event.ip_address ? (
                    <Code className="text-[0.7rem]">{event.ip_address}</Code>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: 'meta',
            header: t('audit.security.columns.details'),
            hideOnMobile: true,
            cell: (event) => (
                <MetaSummary meta={event.meta} limit={4} className="max-w-80" />
            ),
        },
    ];

    return (
        <>
            <Head title={t('audit.security.title')} />
            <div className="grid gap-6">
                <PageHeader
                    title={t('audit.security.title')}
                    description={t('audit.security.description')}
                    actions={
                        can('audit.view') ? (
                            <Button variant="outline" asChild>
                                <Link href={auditIndex().url}>
                                    <FileSearch
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('audit.security.audit_link')}
                                </Link>
                            </Button>
                        ) : null
                    }
                />
                {criticalCount > 0 ? (
                    <InlineAlert
                        tone="danger"
                        icon={ShieldAlert}
                        title={t('audit.security.critical_banner', {
                            count: formatNumber(criticalCount, 0),
                        })}
                        action={
                            <Button
                                size="sm"
                                variant={
                                    criticalOnly ? 'outline' : 'destructive'
                                }
                                onClick={() =>
                                    query.patch({
                                        critical: criticalOnly ? null : '1',
                                    })
                                }
                            >
                                {criticalOnly
                                    ? t('audit.security.show_all')
                                    : t('audit.security.show_critical')}
                            </Button>
                        }
                    />
                ) : null}
                <DataTable
                    id="admin-security-events"
                    columns={columns}
                    data={events}
                    rowKey="id"
                    toolbar={<FiltersBar filters={filters} />}
                    filtered={filtered}
                    emptyTitle={t('audit.security.empty.title')}
                    emptyDescription={t('audit.security.empty.description')}
                    caption={t('audit.security.title')}
                    rowClassName={(event) =>
                        event.severity === 'critical'
                            ? 'bg-danger-soft/20'
                            : undefined
                    }
                    dense
                />
            </div>
        </>
    );
}

SecurityEventsIndex.layout = () => ({
    breadcrumbs: [
        { title: t('admin.nav.system'), href: securityIndex().url },
        { title: t('audit.security.title'), href: securityIndex().url },
    ],
});
