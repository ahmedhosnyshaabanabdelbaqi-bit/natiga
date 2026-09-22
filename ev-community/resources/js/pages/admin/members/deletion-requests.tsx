import { Head, Link, router } from '@inertiajs/react';
import { Eye, UserX, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { DataTableColumn } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import type { FilterDefinition } from '@/components/shared/filters-bar';
import { FiltersBar, useQueryState } from '@/components/shared/filters-bar';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { Textarea } from '@/components/ui/textarea';
import { firstError } from '@/features/members/member-status-actions';
import { DeletionStatusBadge } from '@/features/members/status';
import type {
    DeletionRequestStatus,
    DeletionRequestSummary,
    Option,
} from '@/features/members/types';
import { t } from '@/lib/i18n';
import { formatNumber } from '@/lib/format';
import {
    complete,
    index,
    reject,
    review,
} from '@/routes/admin/members/deletion-requests';
import { index as membersIndex, show } from '@/routes/admin/members';
import type { Paginated } from '@/types/pagination';

type Row = DeletionRequestSummary & {
    /** Server policy: members.delete_requests and not the viewer's own request. */
    can_process: boolean;
    user: {
        name: string;
        email: string;
        status: 'active' | 'disabled';
        member_number: string | null;
        membership_id: string | null;
    };
};

type Props = {
    requests: Paginated<Row>;
    filters: { status?: DeletionRequestStatus; search?: string };
    counts: Record<DeletionRequestStatus | 'total', number>;
    statuses: Option[];
};

type Decision = { kind: 'complete' | 'reject'; row: Row };

export default function AdminDeletionRequests({
    requests,
    counts,
    statuses,
}: Props) {
    const query = useQueryState();
    const [decision, setDecision] = useState<Decision | null>(null);
    const [notes, setNotes] = useState('');
    const [processing, setProcessing] = useState(false);

    const filters: FilterDefinition[] = [
        {
            key: 'search',
            type: 'search',
            label: t('core.actions.search'),
            placeholder: t(
                'members.admin.deletion_requests.search_placeholder',
            ),
            className: 'md:w-72',
        },
        {
            key: 'status',
            type: 'select',
            label: t('core.labels.status'),
            options: statuses,
        },
    ];

    const post = (
        url: string,
        data: Record<string, string>,
        onDone?: () => void,
    ) => {
        setProcessing(true);
        router.post(url, data, {
            preserveScroll: true,
            onSuccess: () => onDone?.(),
            onError: (errors) => toast.error(firstError(errors)),
            onFinish: () => setProcessing(false),
        });
    };

    const decide = (reason?: string) => {
        if (!decision || !reason) {
            return;
        }
        const route =
            decision.kind === 'complete'
                ? complete(decision.row.id)
                : reject(decision.row.id);
        post(route.url, { reason, notes }, () => {
            setDecision(null);
            setNotes('');
        });
    };

    const isOpen = (row: Row) =>
        row.status === 'requested' || row.status === 'under_review';

    const columns: DataTableColumn<Row>[] = [
        {
            key: 'member',
            header: t('members.admin.deletion_requests.member'),
            required: true,
            cell: (row) => (
                <div className="min-w-0">
                    {row.user.membership_id ? (
                        <Link
                            href={show(row.user.membership_id).url}
                            className="font-medium hover:underline"
                        >
                            {row.user.name}
                        </Link>
                    ) : (
                        <span className="font-medium">{row.user.name}</span>
                    )}
                    <p
                        className="truncate text-xs text-muted-foreground"
                        dir="ltr"
                    >
                        {row.user.email}
                    </p>
                    {row.user.member_number ? (
                        <Code className="mt-0.5 text-xs">
                            {row.user.member_number}
                        </Code>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'status',
            header: t('core.labels.status'),
            cell: (row) => <DeletionStatusBadge status={row.status} />,
        },
        {
            key: 'reason',
            header: t('members.admin.deletion_requests.reason'),
            cell: (row) =>
                row.reason ? (
                    <p className="line-clamp-3 max-w-72 text-sm break-words whitespace-pre-line">
                        {row.reason}
                    </p>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
            hideOnMobile: true,
        },
        {
            key: 'requested_at',
            header: t('members.admin.deletion_requests.requested_at'),
            cell: (row) => <DateTime value={row.requested_at} />,
        },
        {
            key: 'processed_at',
            header: t('members.admin.deletion_requests.processed_at'),
            cell: (row) =>
                row.processed_at ? (
                    <div className="text-sm">
                        <DateTime value={row.processed_at} />
                        {row.processed_by ? (
                            <p className="text-xs text-muted-foreground">
                                {row.processed_by}
                            </p>
                        ) : null}
                        {row.notes ? (
                            <p className="mt-0.5 line-clamp-2 max-w-64 text-xs text-muted-foreground">
                                {row.notes}
                            </p>
                        ) : null}
                    </div>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
            hideOnMobile: true,
        },
        {
            key: 'actions',
            header: t('core.labels.actions'),
            align: 'end',
            required: true,
            cell: (row) =>
                isOpen(row) && row.can_process ? (
                    <div className="flex flex-wrap justify-end gap-1.5">
                        {row.status === 'requested' ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={processing}
                                onClick={() => post(review(row.id).url, {})}
                            >
                                <Eye className="size-4" aria-hidden="true" />
                                {t('members.admin.deletion_requests.review')}
                            </Button>
                        ) : null}
                        <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={processing}
                            onClick={() =>
                                setDecision({ kind: 'complete', row })
                            }
                        >
                            <UserX className="size-4" aria-hidden="true" />
                            {t('members.admin.deletion_requests.complete')}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={processing}
                            onClick={() => setDecision({ kind: 'reject', row })}
                        >
                            <XCircle className="size-4" aria-hidden="true" />
                            {t('members.admin.deletion_requests.reject')}
                        </Button>
                    </div>
                ) : null,
        },
    ];

    return (
        <>
            <Head title={t('members.admin.deletion_requests.title')} />
            <PageHeader
                title={t('members.admin.deletion_requests.title')}
                description={t('members.admin.deletion_requests.description')}
            >
                <p className="mt-2 text-sm text-muted-foreground">
                    {statuses.map((status, position) => (
                        <span key={status.value}>
                            {position > 0 ? ' · ' : ''}
                            {status.label}:{' '}
                            <span className="tabular">
                                {formatNumber(
                                    counts[
                                        status.value as DeletionRequestStatus
                                    ] ?? 0,
                                    0,
                                )}
                            </span>
                        </span>
                    ))}
                </p>
            </PageHeader>
            <DataTable<Row>
                id="admin-deletion-requests"
                columns={columns}
                data={requests}
                rowKey="id"
                toolbar={<FiltersBar filters={filters} />}
                filtered={Boolean(query.get('search') || query.get('status'))}
                onResetFilters={() => query.reset()}
                emptyTitle={t('members.admin.deletion_requests.empty')}
                caption={t('members.admin.deletion_requests.title')}
                columnToggle={false}
            />
            <ConfirmDialog
                open={decision !== null}
                onOpenChange={(open) => {
                    if (!open && !processing) {
                        setDecision(null);
                        setNotes('');
                    }
                }}
                title={
                    decision?.kind === 'complete'
                        ? t('members.admin.deletion_requests.complete_title')
                        : t('members.admin.deletion_requests.reject_title')
                }
                description={
                    decision?.kind === 'complete'
                        ? t('members.admin.deletion_requests.complete_text')
                        : t('members.admin.deletion_requests.reject_text')
                }
                confirmLabel={
                    decision?.kind === 'complete'
                        ? t('members.admin.deletion_requests.complete')
                        : t('members.admin.deletion_requests.reject')
                }
                destructive={decision?.kind === 'complete'}
                requireReason
                processing={processing}
                onConfirm={decide}
            >
                {decision ? (
                    <div className="grid gap-3">
                        <InlineAlert
                            tone={
                                decision.kind === 'complete'
                                    ? 'warning'
                                    : 'info'
                            }
                        >
                            {decision.row.user.name}{' '}
                            {decision.row.user.member_number ? (
                                <Code>{decision.row.user.member_number}</Code>
                            ) : null}
                        </InlineAlert>
                        <FormField
                            label={t('members.admin.deletion_requests.notes')}
                            optional
                            hint={t(
                                'members.admin.deletion_requests.notes_hint',
                            )}
                        >
                            <Textarea
                                value={notes}
                                onChange={(event) =>
                                    setNotes(event.target.value)
                                }
                                rows={2}
                                maxLength={2000}
                                disabled={processing}
                            />
                        </FormField>
                    </div>
                ) : null}
            </ConfirmDialog>
        </>
    );
}

AdminDeletionRequests.layout = () => ({
    breadcrumbs: [
        { title: t('members.admin.title'), href: membersIndex.url() },
        {
            title: t('members.admin.deletion_requests.title'),
            href: index.url(),
        },
    ],
});
