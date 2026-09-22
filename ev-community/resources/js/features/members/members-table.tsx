import { Link, router } from '@inertiajs/react';
import { CheckCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { DataTableColumn, RowKey } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import type { FilterDefinition } from '@/components/shared/filters-bar';
import { FiltersBar, useQueryState } from '@/components/shared/filters-bar';
import { PhoneNumber } from '@/components/shared/phone-number';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { useCan } from '@/lib/auth';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { bulkApprove, show } from '@/routes/admin/members';
import { MEMBERSHIP_STATUSES, MembershipStatusBadge } from './status';
import type { MemberListProps, MemberRow, MembershipStatus } from './types';

type Props = MemberListProps & {
    /** `pending` hides the status filter/chips and defaults to oldest first. */
    mode: 'all' | 'pending';
};

const FILTER_KEYS = ['search', 'status', 'governorate_id', 'joined_from', 'joined_to', 'referral_source'];

export function MembersTable({ members, counts, governorates, referral_sources: referralSources, statuses, mode }: Props) {
    const can = useCan();
    const query = useQueryState();
    const [bulk, setBulk] = useState<{ ids: RowKey[]; clear: () => void } | null>(null);
    const [processing, setProcessing] = useState(false);
    const canApprove = can('members.approve');

    const filters: FilterDefinition[] = [
        { key: 'search', type: 'search', label: t('core.actions.search'), placeholder: t('members.admin.search_placeholder'), className: 'md:w-80' },
        ...(mode === 'all' ? [{ key: 'status', type: 'select' as const, label: t('members.admin.filters.status'), options: statuses }] : []),
        { key: 'governorate_id', type: 'select', label: t('members.admin.filters.governorate'), options: governorates.map((g) => ({ value: String(g.id), label: g.name })) },
        { key: 'joined', type: 'daterange', label: t('members.admin.filters.joined') },
        ...(referralSources.length > 0
            ? [{ key: 'referral_source', type: 'select' as const, label: t('members.admin.filters.referral_source'), options: referralSources.map((source) => ({ value: source, label: source })) }]
            : []),
    ];
    const filtered = FILTER_KEYS.some((key) => (mode === 'pending' && key === 'status' ? false : Boolean(query.get(key))));

    const columns: DataTableColumn<MemberRow>[] = [
        {
            key: 'name',
            header: t('members.admin.columns.member'),
            sortable: true,
            required: true,
            cell: (row) => (
                <div className="min-w-0">
                    <Link href={show(row.id).url} className="font-medium hover:underline">
                        {row.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground" dir="ltr">
                        {row.email}
                    </p>
                    {row.user_status === 'disabled' ? <p className="text-xs text-danger">{t('members.admin.account_disabled')}</p> : null}
                </div>
            ),
        },
        { key: 'member_number', header: t('members.admin.columns.member_number'), sortable: true, cell: (row) => <Code>{row.member_number}</Code> },
        { key: 'mobile', header: t('members.admin.columns.contact'), cell: (row) => (row.mobile ? <PhoneNumber value={row.mobile} /> : <span className="text-muted-foreground">—</span>), hideOnMobile: true },
        { key: 'governorate', header: t('members.admin.columns.governorate'), hideOnMobile: true },
        { key: 'status', header: t('members.admin.columns.status'), sortable: true, cell: (row) => <MembershipStatusBadge status={row.status} /> },
        { key: 'joined_at', header: t('members.admin.columns.joined_at'), sortable: true, cell: (row) => <DateTime value={row.joined_at} mode="date" /> },
        { key: 'referral_source', header: t('members.admin.columns.referral_source'), defaultHidden: true, hideOnMobile: true },
    ];

    const confirmBulk = () => {
        if (!bulk) {
            return;
        }
        // Only pending rows can be approved; the server skips anything else as well.
        const ids = members.data.filter((row) => bulk.ids.includes(row.id) && row.status === 'pending').map((row) => row.id);
        setProcessing(true);
        router.post(bulkApprove.url(), { ids }, {
            preserveScroll: true,
            onSuccess: () => {
                bulk.clear();
                setBulk(null);
            },
            onFinish: () => setProcessing(false),
        });
    };

    const selectedPending = (ids: RowKey[]) => members.data.filter((row) => ids.includes(row.id) && row.status === 'pending').length;

    return (
        <div className="flex flex-col gap-4">
            {mode === 'all' ? <StatusChips counts={counts} active={(query.get('status') as MembershipStatus | undefined) ?? null} /> : null}
            <DataTable<MemberRow>
                id={mode === 'pending' ? 'admin-members-pending' : 'admin-members'}
                columns={columns}
                data={members}
                rowKey="id"
                rowHref={(row) => show(row.id).url}
                selectable={canApprove}
                bulkActions={(selected, clear) =>
                    canApprove ? (
                        <Button type="button" size="sm" onClick={() => setBulk({ ids: selected, clear })} disabled={selectedPending(selected) === 0}>
                            <CheckCheck className="size-4" aria-hidden="true" />
                            {t('members.admin.actions.bulk_approve')}
                        </Button>
                    ) : null
                }
                toolbar={<FiltersBar filters={filters} />}
                filtered={filtered}
                onResetFilters={() => query.reset()}
                caption={mode === 'pending' ? t('members.admin.pending_title') : t('members.admin.title')}
                emptyTitle={mode === 'pending' ? t('members.admin.pending_empty') : t('members.admin.empty')}
                emptyDescription={mode === 'pending' ? t('members.admin.pending_empty_hint') : t('members.admin.empty_hint')}
                mobileTitle={(row) => (
                    <span className="flex items-center gap-2">
                        <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
                        {row.name}
                    </span>
                )}
            />
            <ConfirmDialog
                open={bulk !== null}
                onOpenChange={(open) => (!open && !processing ? setBulk(null) : undefined)}
                title={t('members.admin.confirm.bulk_title', { count: bulk ? selectedPending(bulk.ids) : 0 })}
                description={t('members.admin.confirm.bulk_text')}
                confirmLabel={t('members.admin.actions.approve')}
                processing={processing}
                onConfirm={confirmBulk}
            />
        </div>
    );
}

function StatusChips({ counts, active }: { counts: MemberListProps['counts']; active: MembershipStatus | null }) {
    const query = useQueryState();
    const items: { key: MembershipStatus | 'total'; label: string }[] = [{ key: 'total', label: t('members.admin.counts.total') }, ...MEMBERSHIP_STATUSES.map((status) => ({ key: status, label: t(`members.status.${status}`) }))];
    return (
        <nav aria-label={t('members.admin.counts.label')} className="flex flex-wrap gap-2">
            {items.map((item) => {
                const selected = item.key === 'total' ? active === null : active === item.key;
                return (
                    <Link
                        key={item.key}
                        href={item.key === 'total' ? query.href({ status: null }, { resetPage: true }) : query.href({ status: item.key }, { resetPage: true })}
                        preserveScroll
                        aria-current={selected ? 'page' : undefined}
                        className={cn(
                            'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
                            selected ? 'border-brand/50 bg-brand-soft/40 font-medium text-foreground' : 'text-muted-foreground',
                        )}
                    >
                        {item.label}
                        <span className="rounded-full bg-muted px-1.5 text-xs tabular">{formatNumber(counts[item.key], 0)}</span>
                    </Link>
                );
            })}
        </nav>
    );
}

