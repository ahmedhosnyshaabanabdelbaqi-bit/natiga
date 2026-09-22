import { Head, Link } from '@inertiajs/react';
import { Share2 } from 'lucide-react';
import type { DataTableColumn } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import type { FilterDefinition } from '@/components/shared/filters-bar';
import { FiltersBar, useQueryState } from '@/components/shared/filters-bar';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Code } from '@/components/ui/code';
import {
    MembershipStatusBadge,
    ReferralStatusBadge,
} from '@/features/members/status';
import type {
    MembershipStatus,
    Option,
    ReferralStatus,
} from '@/features/members/types';
import { useCan } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { show } from '@/routes/admin/members';
import { index } from '@/routes/admin/referrals';
import type { Paginated } from '@/types/pagination';

type Row = {
    id: number;
    status: ReferralStatus;
    referral_code_used: string;
    created_at: string | null;
    approved_at: string | null;
    referrer: { id: string; member_number: string; name: string };
    referred: {
        id: string;
        member_number: string;
        name: string;
        status: MembershipStatus;
    };
};

type Props = {
    referrals: Paginated<Row>;
    filters: { search?: string; status?: ReferralStatus };
    counts: {
        total: number;
        invited: number;
        registered: number;
        approved: number;
    };
    statuses: Option[];
};

function MemberCell({
    member,
    linkable,
}: {
    member: { id: string; member_number: string; name: string };
    linkable: boolean;
}) {
    return (
        <div className="min-w-0">
            {linkable ? (
                <Link
                    href={show(member.id).url}
                    className="font-medium hover:underline"
                >
                    {member.name}
                </Link>
            ) : (
                <span className="font-medium">{member.name}</span>
            )}
            <div>
                <Code className="text-xs">{member.member_number}</Code>
            </div>
        </div>
    );
}

export default function AdminReferralsIndex({
    referrals,
    counts,
    statuses,
}: Props) {
    const query = useQueryState();
    const can = useCan();
    const linkable = can('members.view');

    const filters: FilterDefinition[] = [
        {
            key: 'search',
            type: 'search',
            label: t('core.actions.search'),
            placeholder: t('referrals.admin.search_placeholder'),
            className: 'md:w-80',
        },
        {
            key: 'status',
            type: 'select',
            label: t('referrals.admin.status'),
            options: statuses,
        },
    ];

    const columns: DataTableColumn<Row>[] = [
        {
            key: 'referrer',
            header: t('referrals.admin.referrer'),
            required: true,
            cell: (row) => (
                <MemberCell member={row.referrer} linkable={linkable} />
            ),
        },
        {
            key: 'referred',
            header: t('referrals.admin.referred'),
            cell: (row) => (
                <div className="flex flex-wrap items-center gap-2">
                    <MemberCell member={row.referred} linkable={linkable} />
                    <MembershipStatusBadge status={row.referred.status} />
                </div>
            ),
        },
        {
            key: 'referral_code_used',
            header: t('referrals.admin.code'),
            cell: (row) => <Code>{row.referral_code_used}</Code>,
            hideOnMobile: true,
        },
        {
            key: 'status',
            header: t('referrals.admin.status'),
            cell: (row) => <ReferralStatusBadge status={row.status} />,
        },
        {
            key: 'created_at',
            header: t('referrals.admin.created_at'),
            cell: (row) => <DateTime value={row.created_at} mode="date" />,
        },
        {
            key: 'approved_at',
            header: t('referrals.admin.approved_at'),
            cell: (row) => <DateTime value={row.approved_at} mode="date" />,
            hideOnMobile: true,
        },
    ];

    return (
        <>
            <Head title={t('referrals.admin.title')} />
            <PageHeader
                title={t('referrals.admin.title')}
                description={t('referrals.admin.description')}
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label={t('referrals.admin.total')}
                    value={counts.total}
                    icon={Share2}
                />
                <StatCard
                    label={t('referrals.stats.invited')}
                    value={counts.invited}
                />
                <StatCard
                    label={t('referrals.stats.registered')}
                    value={counts.registered}
                    tone="brand"
                />
                <StatCard
                    label={t('referrals.stats.approved')}
                    value={counts.approved}
                    tone="success"
                />
            </div>
            <DataTable<Row>
                id="admin-referrals"
                columns={columns}
                data={referrals}
                rowKey="id"
                toolbar={<FiltersBar filters={filters} />}
                filtered={Boolean(query.get('search') || query.get('status'))}
                onResetFilters={() => query.reset()}
                emptyTitle={t('referrals.admin.empty')}
                caption={t('referrals.admin.title')}
            />
        </>
    );
}

AdminReferralsIndex.layout = () => ({
    breadcrumbs: [{ title: t('referrals.admin.title'), href: index.url() }],
});
