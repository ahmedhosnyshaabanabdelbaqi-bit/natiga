import { Head } from '@inertiajs/react';
import { PageHeader } from '@/components/shared/page-header';
import type { Option } from '@/features/members/types';
import { VerifyPanel } from '@/features/members/verify-panel';
import { t } from '@/lib/i18n';
import { index, scan, verify } from '@/routes/admin/members';

export default function AdminMembersScan({ purposes }: { purposes: Option[] }) {
    return (
        <>
            <Head title={t('members.admin.scan.title')} />
            <PageHeader title={t('members.admin.scan.title')} description={t('members.admin.scan.page_description')} />
            <VerifyPanel action={verify()} purposes={purposes} audience="admin" />
        </>
    );
}

AdminMembersScan.layout = () => ({
    breadcrumbs: [
        { title: t('members.admin.title'), href: index.url() },
        { title: t('members.admin.scan.title'), href: scan.url() },
    ],
});
