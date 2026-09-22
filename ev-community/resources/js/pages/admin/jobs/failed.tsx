import { Head, router } from '@inertiajs/react';
import { Activity, AlertOctagon, Clock, Layers, RotateCw, Timer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { DataTableColumn } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { StatCard } from '@/components/shared/stat-card';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { PageErrors } from '@/features/system/page-errors';
import type { FailedJob, QueueHealth } from '@/features/system/types';
import { formatNumber, formatRelative } from '@/lib/format';
import { t } from '@/lib/i18n';
import { destroy, index as failedIndex, retry } from '@/routes/admin/jobs/failed';
import type { Paginated } from '@/types/pagination';

type Props = {
    jobs: Paginated<FailedJob>;
    health: QueueHealth;
};

export default function FailedJobs({ jobs, health }: Props) {
    const [pending, setPending] = useState<{ job: FailedJob; action: 'retry' | 'delete' } | null>(null);
    const pendingTotal = health.pending.reduce((sum, row) => sum + row.count, 0);
    const heartbeatTime = health.heartbeat.at ? formatRelative(health.heartbeat.at) : null;

    const run = () =>
        new Promise<void>((resolve) => {
            if (!pending) {
                resolve();
                return;
            }
            const options = {
                preserveScroll: true,
                onFinish: () => {
                    resolve();
                    setPending(null);
                },
            };
            if (pending.action === 'retry') {
                router.post(retry(pending.job.uuid).url, {}, options);
            } else {
                router.delete(destroy(pending.job.uuid).url, options);
            }
        });

    const columns: DataTableColumn<FailedJob>[] = [
        {
            key: 'job',
            header: t('system.jobs.columns.job'),
            required: true,
            cell: (job) => (
                <span className="grid gap-0.5">
                    <Code className="w-fit text-[0.75rem]">{job.job}</Code>
                    <Code className="w-fit text-[0.65rem] text-muted-foreground">{job.uuid}</Code>
                </span>
            ),
        },
        { key: 'queue', header: t('system.jobs.columns.queue'), cell: (job) => <Code className="text-[0.75rem]">{job.queue}</Code> },
        { key: 'connection', header: t('system.jobs.columns.connection'), defaultHidden: true, cell: (job) => <Code className="text-[0.75rem]">{job.connection}</Code> },
        { key: 'failed_at', header: t('system.jobs.columns.failed_at'), cell: (job) => <DateTime value={job.failed_at} className="whitespace-nowrap" /> },
        {
            key: 'attempts',
            header: t('system.jobs.columns.attempts'),
            hideOnMobile: true,
            cell: (job) => (job.attempts !== null ? <span className="tabular">{job.max_tries ? `${job.attempts}/${job.max_tries}` : job.attempts}</span> : <span className="text-muted-foreground">—</span>),
        },
        {
            key: 'exception',
            header: t('system.jobs.columns.exception'),
            cell: (job) => (
                <span className="line-clamp-3 max-w-md font-mono text-xs break-all" dir="ltr" title={job.exception}>
                    {job.exception}
                </span>
            ),
        },
        {
            key: 'actions',
            header: <span className="sr-only">{t('core.labels.actions')}</span>,
            align: 'end',
            required: true,
            cell: (job) => (
                <div className="flex justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => setPending({ job, action: 'retry' })}>
                        <RotateCw className="size-4" aria-hidden="true" />
                        {t('system.jobs.actions.retry')}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setPending({ job, action: 'delete' })} aria-label={t('system.jobs.actions.delete')}>
                        <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <>
            <Head title={t('system.jobs.title')} />
            <div className="grid gap-6">
                <PageHeader title={t('system.jobs.title')} description={t('system.jobs.description')} />
                <PageErrors />

                <SectionCard title={t('system.jobs.health.title')}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <StatCard label={t('system.jobs.health.connection')} value={<Code className="text-base">{health.connection}</Code>} icon={Layers} />
                            <StatCard label={t('system.jobs.health.pending')} value={formatNumber(pendingTotal, 0)} icon={Clock} tone={pendingTotal > 0 ? 'warning' : 'default'} />
                            <StatCard label={t('system.jobs.health.reserved')} value={formatNumber(health.reserved, 0)} icon={Activity} />
                            <StatCard label={t('system.jobs.health.failed')} value={formatNumber(health.failed, 0)} icon={AlertOctagon} tone={health.failed > 0 ? 'danger' : 'success'} />
                        </div>
                        {health.heartbeat.stale ? (
                            <InlineAlert tone="warning" icon={Timer} title={`${t('system.jobs.health.scheduler')}: ${t('system.jobs.health.stale')}`}>
                                {heartbeatTime ? t('system.jobs.health.heartbeat_stale', { time: heartbeatTime }) : t('system.jobs.health.heartbeat_missing')}
                            </InlineAlert>
                        ) : (
                            <InlineAlert tone="success" icon={Timer} title={`${t('system.jobs.health.scheduler')}: ${t('system.jobs.health.ok')}`}>
                                {t('system.jobs.health.heartbeat_ok', { time: heartbeatTime ?? '—' })}
                            </InlineAlert>
                        )}
                        <div className="grid gap-2">
                            <p className="text-sm font-medium">{t('system.jobs.health.per_queue')}</p>
                            {health.pending.length === 0 ? (
                                <p className="text-sm text-muted-foreground">{t('system.jobs.health.no_pending')}</p>
                            ) : (
                                <ul className="flex flex-wrap gap-2">
                                    {health.pending.map((row) => (
                                        <li key={row.queue} className="flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm">
                                            <Code className="text-[0.75rem]">{row.queue}</Code>
                                            <span className="font-medium tabular">{formatNumber(row.count, 0)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </SectionCard>

                <DataTable
                    id="admin-failed-jobs"
                    columns={columns}
                    data={jobs}
                    rowKey="uuid"
                    emptyTitle={t('system.jobs.empty.title')}
                    emptyDescription={t('system.jobs.empty.description')}
                    caption={t('system.jobs.title')}
                />
            </div>
            <ConfirmDialog
                open={pending !== null}
                onOpenChange={(open) => (!open ? setPending(null) : undefined)}
                title={pending?.action === 'delete' ? t('system.jobs.delete_confirm.title') : t('system.jobs.retry_confirm.title')}
                description={pending?.action === 'delete' ? t('system.jobs.delete_confirm.description') : t('system.jobs.retry_confirm.description')}
                confirmLabel={pending?.action === 'delete' ? t('system.jobs.actions.delete') : t('system.jobs.actions.retry')}
                destructive={pending?.action === 'delete'}
                onConfirm={run}
            />
        </>
    );
}

FailedJobs.layout = () => ({
    breadcrumbs: [
        { title: t('admin.nav.system'), href: failedIndex().url },
        { title: t('system.jobs.title'), href: failedIndex().url },
    ],
});
