import { Head, Link } from '@inertiajs/react';
import { Download, FileSearch, Lock, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
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
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import type { AuditSummary } from '@/features/system/audit-detail-sheet';
import { AuditDetailSheet } from '@/features/system/audit-detail-sheet';
import { humanize, tOr } from '@/features/system/i18n';
import { can } from '@/lib/auth';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { exportMethod, index as auditIndex } from '@/routes/admin/audit-logs';
import { index as securityIndex } from '@/routes/admin/security-events';
import type { Paginated } from '@/types/pagination';

type Props = {
    logs: Paginated<AuditSummary>;
    filters: Record<string, string | undefined>;
    actions: string[];
    entityTypes: string[];
    exportMax: number;
};

const FILTER_KEYS = [
    'actor',
    'action',
    'entity_type',
    'entity_id',
    'request_id',
    'from',
    'to',
];

export default function AuditLogsIndex({
    logs,
    actions,
    entityTypes,
    exportMax,
}: Props) {
    const query = useQueryState();
    const [selected, setSelected] = useState<AuditSummary | null>(null);
    const [confirmExport, setConfirmExport] = useState(false);

    const filters: FilterDefinition[] = [
        {
            key: 'actor',
            type: 'search',
            label: t('audit.logs.filters.actor'),
            className: 'md:w-60',
        },
        {
            key: 'action',
            type: 'select',
            label: t('audit.logs.filters.action'),
            options: actions.map((action) => ({
                value: action,
                label: action,
            })),
        },
        {
            key: 'entity_type',
            type: 'select',
            label: t('audit.logs.filters.entity_type'),
            options: entityTypes.map((type) => ({
                value: type,
                label: type.split('\\').pop() ?? type,
            })),
        },
        {
            key: 'entity_id',
            type: 'search',
            label: t('audit.logs.filters.entity_id'),
            placeholder: t('audit.logs.filters.entity_id'),
            className: 'md:w-36',
        },
        {
            key: 'request_id',
            type: 'search',
            label: t('audit.logs.filters.request_id'),
            placeholder: t('audit.logs.filters.request_id'),
            className: 'md:w-52',
        },
        {
            key: 'date',
            type: 'daterange',
            label: t('audit.logs.filters.date'),
            fromKey: 'from',
            toKey: 'to',
        },
    ];
    const filtered = filters.some((filter) =>
        isFilterActive(filter, query.query),
    );
    const exportQuery = Object.fromEntries(
        FILTER_KEYS.map((key) => [key, query.get(key)]).filter(
            ([, value]) => value !== undefined && value !== '',
        ),
    );
    const exportUrl = exportMethod({ query: exportQuery }).url;

    const columns: DataTableColumn<AuditSummary>[] = [
        {
            key: 'created_at',
            header: t('audit.logs.columns.created_at'),
            required: true,
            cell: (log) => (
                <DateTime
                    value={log.created_at}
                    className="whitespace-nowrap"
                />
            ),
        },
        {
            key: 'action',
            header: t('audit.logs.columns.action'),
            cell: (log) => <Code className="text-[0.75rem]">{log.action}</Code>,
        },
        {
            key: 'actor',
            header: t('audit.logs.columns.actor'),
            cell: (log) =>
                log.actor ? (
                    <span className="grid">
                        <span className="font-medium">{log.actor.name}</span>
                        <span
                            className="text-xs text-muted-foreground"
                            dir="ltr"
                        >
                            {log.actor.email}
                        </span>
                    </span>
                ) : (
                    <span className="text-muted-foreground">
                        {tOr(
                            `audit.logs.actor_types.${log.actor_type}`,
                            humanize(log.actor_type),
                        )}
                    </span>
                ),
        },
        {
            key: 'entity',
            header: t('audit.logs.columns.entity'),
            cell: (log) =>
                log.entity_type || log.entity_label ? (
                    <span className="flex flex-wrap items-center gap-1">
                        {log.entity_type ? (
                            <Code className="text-[0.7rem]">
                                {log.entity_type}
                            </Code>
                        ) : null}
                        {log.entity_id !== null ? (
                            <span className="tabular text-xs text-muted-foreground">
                                #{log.entity_id}
                            </span>
                        ) : null}
                        {log.entity_label ? (
                            <span className="max-w-48 truncate text-sm">
                                {log.entity_label}
                            </span>
                        ) : null}
                    </span>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: 'reason',
            header: t('audit.logs.columns.reason'),
            hideOnMobile: true,
            cell: (log) =>
                log.reason ? (
                    <span className="line-clamp-2 max-w-64 text-sm">
                        {log.reason}
                    </span>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: 'request_id',
            header: t('audit.logs.columns.request_id'),
            defaultHidden: true,
            cell: (log) =>
                log.request_id ? (
                    <Code className="text-[0.7rem]">
                        {log.request_id.slice(0, 10)}…
                    </Code>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
    ];

    return (
        <>
            <Head title={t('audit.logs.title')} />
            <div className="grid gap-6">
                <PageHeader
                    title={t('audit.logs.title')}
                    description={t('audit.logs.description')}
                    actions={
                        <>
                            {can('security_events.view') ? (
                                <Button variant="outline" asChild>
                                    <Link href={securityIndex().url}>
                                        <ShieldAlert
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                        {t('audit.logs.security_link')}
                                    </Link>
                                </Button>
                            ) : null}
                            <Button
                                variant="outline"
                                onClick={() => setConfirmExport(true)}
                                disabled={logs.total === 0}
                            >
                                <Download
                                    className="size-4"
                                    aria-hidden="true"
                                />
                                {t('audit.logs.export.action')}
                            </Button>
                        </>
                    }
                />
                <InlineAlert tone="info" icon={Lock}>
                    {t('audit.logs.immutable')}
                </InlineAlert>
                <DataTable
                    id="admin-audit-logs"
                    columns={columns}
                    data={logs}
                    rowKey="id"
                    onRowClick={setSelected}
                    toolbar={<FiltersBar filters={filters} />}
                    filtered={filtered}
                    emptyTitle={t('audit.logs.empty.title')}
                    emptyDescription={t('audit.logs.empty.description')}
                    caption={t('audit.logs.title')}
                    mobileTitle={(log) => (
                        <span className="flex items-center gap-2">
                            <FileSearch
                                className="size-4 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <Code className="text-[0.75rem]">{log.action}</Code>
                        </span>
                    )}
                    dense
                />
            </div>
            <AuditDetailSheet
                entry={selected}
                onClose={() => setSelected(null)}
            />
            <ConfirmDialog
                open={confirmExport}
                onOpenChange={setConfirmExport}
                title={t('audit.logs.export.title')}
                description={t('audit.logs.export.description', {
                    max: formatNumber(exportMax, 0),
                })}
                confirmLabel={t('audit.logs.export.action')}
                onConfirm={() => {
                    setConfirmExport(false);
                    window.location.assign(exportUrl);
                }}
            />
        </>
    );
}

AuditLogsIndex.layout = () => ({
    breadcrumbs: [
        { title: t('admin.nav.system'), href: auditIndex().url },
        { title: t('audit.logs.title'), href: auditIndex().url },
    ],
});
