import { Head, Link } from '@inertiajs/react';
import { Activity, Plus } from 'lucide-react';
import type { DataTableColumn } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import type { FilterDefinition } from '@/components/shared/filters-bar';
import { FiltersBar, isFilterActive, useQueryState } from '@/components/shared/filters-bar';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IncidentStatusBadge, SeverityBadge } from '@/features/operations/badges';
import type { IncidentStatus, IncidentSummary, PersonRef, Severity } from '@/features/operations/types';
import { can } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { create, index as incidentsIndex, show } from '@/routes/admin/incidents';
import { index as operationsIndex } from '@/routes/admin/operations';
import type { Paginated } from '@/types/pagination';

type Props = {
    incidents: Paginated<IncidentSummary>;
    filters: Record<string, string | undefined> & { status: string };
    owners: PersonRef[];
    severities: Severity[];
    statuses: IncidentStatus[];
    can: { manage: boolean };
};

export default function IncidentsIndex({ incidents, filters: current, owners, severities, statuses, can: abilities }: Props) {
    const query = useQueryState();

    const filters: FilterDefinition[] = [
        { key: 'q', type: 'search', label: t('operations.incidents.filters.q'), className: 'md:w-64' },
        { key: 'severity', type: 'select', label: t('operations.incidents.filters.severity'), options: severities.map((severity) => ({ value: severity, label: t(`operations.severity.${severity}`) })) },
        {
            key: 'owner',
            type: 'select',
            label: t('operations.incidents.filters.owner'),
            options: [{ value: 'me', label: t('operations.incidents.filters.mine') }, ...owners.map((person) => ({ value: person.id, label: person.name }))],
        },
    ];
    const filtered = filters.some((filter) => isFilterActive(filter, query.query)) || current.status !== 'active';

    const columns: DataTableColumn<IncidentSummary>[] = [
        {
            key: 'number',
            header: t('operations.incidents.fields.number'),
            required: true,
            cell: (incident) => (
                <Link href={show(incident.id).url} className="hover:underline">
                    <Code>{incident.number}</Code>
                </Link>
            ),
        },
        { key: 'title', header: t('operations.incidents.fields.title'), cell: (incident) => <span className="line-clamp-2 max-w-md font-medium">{incident.title}</span> },
        { key: 'severity', header: t('operations.incidents.fields.severity'), cell: (incident) => <SeverityBadge severity={incident.severity} /> },
        { key: 'status', header: t('operations.incidents.fields.status'), cell: (incident) => <IncidentStatusBadge status={incident.status} /> },
        { key: 'owner', header: t('operations.incidents.fields.owner'), cell: (incident) => incident.owner?.name ?? <span className="text-muted-foreground">{t('operations.incidents.labels.no_owner')}</span> },
        { key: 'affected_module', header: t('operations.incidents.fields.affected_module'), hideOnMobile: true, cell: (incident) => (incident.affected_module ? <Code className="text-[0.7rem]">{incident.affected_module}</Code> : <span className="text-muted-foreground">—</span>) },
        { key: 'started_at', header: t('operations.incidents.fields.started_at'), cell: (incident) => <DateTime value={incident.started_at} className="whitespace-nowrap" /> },
        { key: 'resolved_at', header: t('operations.incidents.fields.resolved_at'), defaultHidden: true, cell: (incident) => <DateTime value={incident.resolved_at} className="whitespace-nowrap" /> },
    ];

    return (
        <>
            <Head title={t('operations.incidents.title')} />
            <div className="grid gap-6">
                <PageHeader
                    title={t('operations.incidents.title')}
                    description={t('operations.incidents.description')}
                    actions={
                        <>
                            {can(['operations.view', 'operations.manage']) ? (
                                <Button variant="outline" asChild>
                                    <Link href={operationsIndex().url}>
                                        <Activity className="size-4" aria-hidden="true" />
                                        {t('operations.incidents.actions.exceptions')}
                                    </Link>
                                </Button>
                            ) : null}
                            {abilities.manage ? (
                                <Button asChild>
                                    <Link href={create().url}>
                                        <Plus className="size-4" aria-hidden="true" />
                                        {t('operations.incidents.actions.create')}
                                    </Link>
                                </Button>
                            ) : null}
                        </>
                    }
                />
                {!abilities.manage ? <InlineAlert tone="info">{t('operations.incidents.read_only')}</InlineAlert> : null}
                <DataTable
                    id="admin-incidents"
                    columns={columns}
                    data={incidents}
                    rowKey="id"
                    rowHref={(incident) => show(incident.id).url}
                    toolbar={
                        <FiltersBar filters={filters}>
                            <Select value={current.status} onValueChange={(value) => query.patch({ status: value === 'active' ? null : value })}>
                                <SelectTrigger className="w-full md:w-44" aria-label={t('operations.incidents.filters.status')}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">{t('operations.incidents.filters.active')}</SelectItem>
                                    <SelectItem value="all">{t('ui.filters.all')}</SelectItem>
                                    {statuses.map((status) => (
                                        <SelectItem key={status} value={status}>
                                            {t(`operations.incident_status.${status}`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FiltersBar>
                    }
                    filtered={filtered}
                    onResetFilters={() => query.reset()}
                    emptyTitle={t('operations.incidents.empty.title')}
                    emptyDescription={t('operations.incidents.empty.description')}
                    emptyAction={
                        abilities.manage ? (
                            <Button asChild size="sm">
                                <Link href={create().url}>{t('operations.incidents.actions.create')}</Link>
                            </Button>
                        ) : undefined
                    }
                    caption={t('operations.incidents.title')}
                    mobileTitle={(incident) => (
                        <span className="flex flex-wrap items-center gap-2">
                            <Code>{incident.number}</Code>
                            <span>{incident.title}</span>
                        </span>
                    )}
                />
            </div>
        </>
    );
}

IncidentsIndex.layout = () => ({
    breadcrumbs: [
        { title: t('operations.exceptions.title'), href: operationsIndex().url },
        { title: t('operations.incidents.title'), href: incidentsIndex().url },
    ],
});
