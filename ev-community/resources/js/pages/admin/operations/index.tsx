import { Head, Link, router, useForm } from '@inertiajs/react';
import { Ban, CheckCircle2, Eye, ListTodo, Siren, UserPlus, Workflow } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { DataTableColumn } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import type { FilterDefinition } from '@/components/shared/filters-bar';
import { FiltersBar, isFilterActive, useQueryState } from '@/components/shared/filters-bar';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { DescriptionList } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Code } from '@/components/ui/code';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { MetaSummary } from '@/features/system/meta-summary';
import { PageErrors } from '@/features/system/page-errors';
import { ExceptionStatusBadge, SEVERITY_TONE, SeverityBadge } from '@/features/operations/badges';
import type { ExceptionStatus, OperationsExceptionRow, PersonRef, Severity } from '@/features/operations/types';
import { can } from '@/lib/auth';
import { formatNumber } from '@/lib/format';
import { t, useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { index as incidentsIndex } from '@/routes/admin/incidents';
import { index as failedJobsIndex } from '@/routes/admin/jobs/failed';
import { assign, ignore, index as operationsIndex, resolve } from '@/routes/admin/operations';
import type { Paginated } from '@/types/pagination';

type Props = {
    exceptions: Paginated<OperationsExceptionRow>;
    filters: Record<string, string | undefined> & { status: string };
    counts: Record<Severity, number>;
    assignees: PersonRef[];
    categories: string[];
    severities: Severity[];
    statuses: ExceptionStatus[];
    can: { manage: boolean };
};

const NOBODY = '__nobody__';

function AssignDialog({ exception, assignees, onClose }: { exception: OperationsExceptionRow; assignees: PersonRef[]; onClose: () => void }) {
    const form = useForm({ assignee: exception.assignee?.id ?? '', note: '' });
    return (
        <Dialog open onOpenChange={(open) => (!open && !form.processing ? onClose() : undefined)}>
            <DialogContent>
                <form
                    className="grid gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.submit(assign(exception.id), { preserveScroll: true, onSuccess: onClose });
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{t('operations.exceptions.assign.title')}</DialogTitle>
                        <DialogDescription>{exception.title}</DialogDescription>
                    </DialogHeader>
                    <FormField label={t('operations.exceptions.assign.assignee')} error={form.errors.assignee}>
                        <Select value={form.data.assignee === '' ? NOBODY : form.data.assignee} onValueChange={(value) => form.setData('assignee', value === NOBODY ? '' : value)}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NOBODY}>{t('operations.exceptions.assign.nobody')}</SelectItem>
                                {assignees.map((person) => (
                                    <SelectItem key={person.id} value={person.id}>
                                        {person.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </FormField>
                    <FormField label={t('operations.exceptions.assign.note')} optional error={form.errors.note}>
                        <Textarea value={form.data.note} onChange={(event) => form.setData('note', event.target.value)} rows={2} maxLength={500} />
                    </FormField>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose} disabled={form.processing}>
                            {t('core.actions.cancel')}
                        </Button>
                        <Button type="submit" disabled={form.processing}>
                            {form.processing ? <Spinner /> : <UserPlus className="size-4" aria-hidden="true" />}
                            {t('operations.exceptions.assign.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function DetailSheet({ exception, onClose }: { exception: OperationsExceptionRow | null; onClose: () => void }) {
    const { isRtl } = useLocale();
    return (
        <Sheet open={exception !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
            <SheetContent side={isRtl ? 'left' : 'right'} className="w-full overflow-y-auto sm:max-w-lg">
                {exception ? (
                    <>
                        <SheetHeader>
                            <SheetTitle className="pe-6">{exception.title}</SheetTitle>
                            <SheetDescription asChild>
                                <div className="flex flex-wrap items-center gap-2">
                                    <SeverityBadge severity={exception.severity} />
                                    <ExceptionStatusBadge status={exception.status} />
                                    <span>{t(`operations.categories.${exception.category}`)}</span>
                                </div>
                            </SheetDescription>
                        </SheetHeader>
                        <div className="grid gap-6 px-4 pb-6">
                            <DescriptionList
                                items={[
                                    { label: t('operations.exceptions.columns.occurrences'), value: formatNumber(exception.occurrences, 0) },
                                    { label: t('operations.exceptions.columns.assignee'), value: exception.assignee?.name ?? t('operations.exceptions.labels.unassigned') },
                                    { label: t('operations.exceptions.labels.first_seen'), value: exception.created_at, type: 'datetime' },
                                    { label: t('operations.exceptions.columns.detected_at'), value: exception.detected_at, type: 'datetime' },
                                    { label: t('operations.exceptions.columns.source'), value: exception.source, type: 'code' },
                                    { label: t('operations.exceptions.labels.dedup_key'), value: exception.dedup_key, type: 'code' },
                                    { label: t('operations.exceptions.labels.resolved_at'), value: exception.resolved_at, type: 'datetime', hidden: !exception.resolved_at },
                                    { label: t('operations.exceptions.labels.resolved_by'), value: exception.resolved_by, hidden: !exception.resolved_at },
                                    { label: t('operations.exceptions.labels.resolution'), value: exception.resolution, full: true, hidden: !exception.resolution },
                                ]}
                            />
                            <section className="grid gap-2">
                                <h3 className="text-sm font-medium">{t('operations.exceptions.labels.details')}</h3>
                                {exception.details && Object.keys(exception.details).length > 0 ? (
                                    <MetaSummary meta={exception.details} className="rounded-lg border p-3" />
                                ) : (
                                    <p className="text-sm text-muted-foreground">{t('operations.exceptions.labels.no_details')}</p>
                                )}
                            </section>
                        </div>
                    </>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

export default function OperationsIndex({ exceptions, filters: current, counts, assignees, categories, severities, statuses, can: abilities }: Props) {
    const query = useQueryState();
    const [viewing, setViewing] = useState<OperationsExceptionRow | null>(null);
    const [assigning, setAssigning] = useState<OperationsExceptionRow | null>(null);
    const [closing, setClosing] = useState<{ exception: OperationsExceptionRow; action: 'resolve' | 'ignore' } | null>(null);

    const filters: FilterDefinition[] = [
        { key: 'q', type: 'search', label: t('operations.exceptions.filters.q'), className: 'md:w-64' },
        { key: 'severity', type: 'select', label: t('operations.exceptions.filters.severity'), options: severities.map((severity) => ({ value: severity, label: t(`operations.severity.${severity}`) })) },
        { key: 'category', type: 'select', label: t('operations.exceptions.filters.category'), options: categories.map((category) => ({ value: category, label: t(`operations.categories.${category}`) })) },
        {
            key: 'assigned',
            type: 'select',
            label: t('operations.exceptions.filters.assigned'),
            options: [
                { value: 'me', label: t('operations.exceptions.filters.me') },
                { value: 'unassigned', label: t('operations.exceptions.filters.unassigned') },
                ...assignees.map((person) => ({ value: person.id, label: person.name })),
            ],
        },
    ];
    const filtered = filters.some((filter) => isFilterActive(filter, query.query)) || current.status !== 'live';

    const close = (reason?: string) =>
        new Promise<void>((done) => {
            if (!closing) {
                done();
                return;
            }
            const options = {
                preserveScroll: true,
                onFinish: () => {
                    done();
                    setClosing(null);
                },
            };
            if (closing.action === 'resolve') {
                router.post(resolve(closing.exception.id).url, { resolution: reason ?? '' }, options);
            } else {
                router.post(ignore(closing.exception.id).url, { reason: reason ?? '' }, options);
            }
        });

    const isLive = (exception: OperationsExceptionRow) => exception.status === 'open' || exception.status === 'assigned';

    const columns: DataTableColumn<OperationsExceptionRow>[] = [
        { key: 'severity', header: t('operations.exceptions.columns.severity'), cell: (exception) => <SeverityBadge severity={exception.severity} /> },
        {
            key: 'title',
            header: t('operations.exceptions.columns.title'),
            required: true,
            cell: (exception) => (
                <span className="grid max-w-md gap-0.5">
                    <span className="font-medium break-words">{exception.title}</span>
                    {exception.source ? <Code className="w-fit text-[0.7rem] text-muted-foreground">{exception.source}</Code> : null}
                </span>
            ),
        },
        { key: 'category', header: t('operations.exceptions.columns.category'), cell: (exception) => t(`operations.categories.${exception.category}`) },
        { key: 'status', header: t('operations.exceptions.columns.status'), cell: (exception) => <ExceptionStatusBadge status={exception.status} /> },
        { key: 'assignee', header: t('operations.exceptions.columns.assignee'), cell: (exception) => exception.assignee?.name ?? <span className="text-muted-foreground">{t('operations.exceptions.labels.unassigned')}</span> },
        {
            key: 'occurrences',
            header: t('operations.exceptions.columns.occurrences'),
            align: 'end',
            cell: (exception) => <span className="tabular">{t('operations.exceptions.labels.occurrences', { count: formatNumber(exception.occurrences, 0) })}</span>,
        },
        { key: 'detected_at', header: t('operations.exceptions.columns.detected_at'), cell: (exception) => <DateTime value={exception.detected_at} mode="relative" /> },
        {
            key: 'actions',
            header: <span className="sr-only">{t('core.labels.actions')}</span>,
            align: 'end',
            required: true,
            cell: (exception) => (
                <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setViewing(exception)} aria-label={t('operations.exceptions.actions.view')}>
                        <Eye className="size-4" aria-hidden="true" />
                    </Button>
                    {abilities.manage && isLive(exception) ? (
                        <>
                            <Button variant="ghost" size="icon" onClick={() => setAssigning(exception)} aria-label={t('operations.exceptions.actions.assign')}>
                                <UserPlus className="size-4" aria-hidden="true" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setClosing({ exception, action: 'resolve' })} aria-label={t('operations.exceptions.actions.resolve')}>
                                <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setClosing({ exception, action: 'ignore' })} aria-label={t('operations.exceptions.actions.ignore')}>
                                <Ban className="size-4" aria-hidden="true" />
                            </Button>
                        </>
                    ) : null}
                </div>
            ),
        },
    ];

    return (
        <>
            <Head title={t('operations.exceptions.title')} />
            <div className="grid gap-6">
                <PageHeader
                    title={t('operations.exceptions.title')}
                    description={t('operations.exceptions.description')}
                    actions={
                        <>
                            {can(['incidents.view', 'incidents.manage']) ? (
                                <Button variant="outline" asChild>
                                    <Link href={incidentsIndex().url}>
                                        <Siren className="size-4" aria-hidden="true" />
                                        {t('operations.exceptions.actions.incidents')}
                                    </Link>
                                </Button>
                            ) : null}
                            {can('jobs.manage') ? (
                                <Button variant="outline" asChild>
                                    <Link href={failedJobsIndex().url}>
                                        <Workflow className="size-4" aria-hidden="true" />
                                        {t('operations.exceptions.actions.failed_jobs')}
                                    </Link>
                                </Button>
                            ) : null}
                        </>
                    }
                />
                <PageErrors />
                {!abilities.manage ? <InlineAlert tone="info">{t('operations.exceptions.read_only')}</InlineAlert> : null}

                <section aria-label={t('operations.exceptions.labels.open_by_severity')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {severities.map((severity) => {
                        const active = query.get('severity') === severity;
                        const tone = SEVERITY_TONE[severity];
                        return (
                            <Card key={severity} className={cn('shadow-card transition', active && 'ring-2 ring-brand/50')}>
                                <CardContent className="p-0">
                                    <button
                                        type="button"
                                        onClick={() => query.patch({ severity: active ? null : severity, status: null })}
                                        className="flex w-full items-center justify-between gap-3 rounded-xl p-4 text-start focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
                                        aria-pressed={active}
                                    >
                                        <span className="grid gap-1">
                                            <span className="text-xs font-medium text-muted-foreground">{t(`operations.severity.${severity}`)}</span>
                                            <span className={cn('text-2xl font-semibold tabular', counts[severity] > 0 && tone === 'danger' && 'text-danger', counts[severity] > 0 && tone === 'warning' && 'text-warning')}>
                                                {formatNumber(counts[severity] ?? 0, 0)}
                                            </span>
                                        </span>
                                        <ListTodo className="size-5 text-muted-foreground" aria-hidden="true" />
                                    </button>
                                </CardContent>
                            </Card>
                        );
                    })}
                </section>

                <DataTable
                    id="admin-operations-exceptions"
                    columns={columns}
                    data={exceptions}
                    rowKey="id"
                    onRowClick={setViewing}
                    toolbar={
                        <FiltersBar filters={filters}>
                            <Select value={current.status} onValueChange={(value) => query.patch({ status: value === 'live' ? null : value })}>
                                <SelectTrigger className="w-full md:w-48" aria-label={t('operations.exceptions.filters.status')}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="live">{t('operations.exceptions.filters.live')}</SelectItem>
                                    <SelectItem value="all">{t('ui.filters.all')}</SelectItem>
                                    {statuses.map((status) => (
                                        <SelectItem key={status} value={status}>
                                            {t(`operations.exception_status.${status}`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FiltersBar>
                    }
                    filtered={filtered}
                    onResetFilters={() => query.reset()}
                    emptyTitle={t('operations.exceptions.empty.title')}
                    emptyDescription={t('operations.exceptions.empty.description')}
                    caption={t('operations.exceptions.title')}
                    rowClassName={(exception) => (exception.severity === 'p0' && isLive(exception) ? 'bg-danger-soft/20' : undefined)}
                />
            </div>

            <DetailSheet exception={viewing} onClose={() => setViewing(null)} />
            {assigning ? <AssignDialog exception={assigning} assignees={assignees} onClose={() => setAssigning(null)} /> : null}
            <ConfirmDialog
                open={closing !== null}
                onOpenChange={(open) => (!open ? setClosing(null) : undefined)}
                title={closing?.action === 'ignore' ? t('operations.exceptions.ignore.title') : t('operations.exceptions.resolve.title')}
                description={
                    <>
                        <span className="block font-medium text-foreground">{closing?.exception.title}</span>
                        <span className="mt-1 block">{closing?.action === 'ignore' ? t('operations.exceptions.ignore.description') : t('operations.exceptions.resolve.description')}</span>
                    </>
                }
                confirmLabel={closing?.action === 'ignore' ? t('operations.exceptions.ignore.submit') : t('operations.exceptions.resolve.submit')}
                reasonLabel={closing?.action === 'ignore' ? t('operations.exceptions.ignore.field') : t('operations.exceptions.resolve.field')}
                requireReason
                onConfirm={close}
            />
        </>
    );
}

OperationsIndex.layout = () => ({
    breadcrumbs: [{ title: t('operations.exceptions.title'), href: operationsIndex().url }],
});
