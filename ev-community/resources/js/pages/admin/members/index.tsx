import { Head, Link } from '@inertiajs/react';
import { Clock, Download, ScanLine, UserX } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { useQueryState } from '@/components/shared/use-query-state';
import { Button } from '@/components/ui/button';
import { MembersTable } from '@/features/members/members-table';
import type { MemberListProps } from '@/features/members/types';
import { useCan } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { index as deletionRequestsIndex } from '@/routes/admin/members/deletion-requests';
import { exportMethod, index, pending, scan } from '@/routes/admin/members';

export default function AdminMembersIndex(props: MemberListProps) {
    const can = useCan();
    const query = useQueryState();
    // The export applies exactly the filters/sort currently shown in the table.
    const exportUrl = exportMethod.url({ query: Object.fromEntries(Object.entries(query.query).filter(([key]) => key !== 'page')) });

    return (
        <>
            <Head title={t('members.admin.title')} />
            <PageHeader
                title={t('members.admin.title')}
                description={t('members.admin.description')}
                actions={
                    <>
                        <Button asChild variant="outline" size="sm">
                            <Link href={pending.url()}>
                                <Clock className="size-4" aria-hidden="true" />
                                {t('members.admin.actions.view_pending')}
                                {props.counts.pending > 0 ? <span className="rounded-full bg-warning-soft px-1.5 text-xs text-warning tabular">{props.counts.pending}</span> : null}
                            </Link>
                        </Button>
                        {can('members.verify') ? (
                            <Button asChild variant="outline" size="sm">
                                <Link href={scan.url()}>
                                    <ScanLine className="size-4" aria-hidden="true" />
                                    {t('members.admin.actions.scan')}
                                </Link>
                            </Button>
                        ) : null}
                        {can('members.delete_requests') ? (
                            <Button asChild variant="outline" size="sm">
                                <Link href={deletionRequestsIndex.url()}>
                                    <UserX className="size-4" aria-hidden="true" />
                                    {t('members.admin.actions.deletion_requests')}
                                </Link>
                            </Button>
                        ) : null}
                        {can('members.export') ? (
                            <Button asChild size="sm">
                                <a href={exportUrl} download>
                                    <Download className="size-4" aria-hidden="true" />
                                    {t('members.admin.actions.export_csv')}
                                </a>
                            </Button>
                        ) : null}
                    </>
                }
            />
            <MembersTable {...props} mode="all" />
        </>
    );
}

AdminMembersIndex.layout = () => ({ breadcrumbs: [{ title: t('members.admin.title'), href: index.url() }] });
