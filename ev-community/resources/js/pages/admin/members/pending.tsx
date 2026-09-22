import { Head } from '@inertiajs/react';
import { PageHeader } from '@/components/shared/page-header';
import { MembersTable } from '@/features/members/members-table';
import type { MemberListProps } from '@/features/members/types';
import { t } from '@/lib/i18n';
import { index, pending } from '@/routes/admin/members';

export default function AdminMembersPending(props: MemberListProps) {
    return (
        <>
            <Head title={t('members.admin.pending_title')} />
            <PageHeader
                title={t('members.admin.pending_title')}
                description={t('members.admin.pending_description')}
            />
            <MembersTable {...props} mode="pending" />
        </>
    );
}

AdminMembersPending.layout = () => ({
    breadcrumbs: [
        { title: t('members.admin.title'), href: index.url() },
        { title: t('members.admin.pending_title'), href: pending.url() },
    ],
});
