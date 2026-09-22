import { Head, usePage } from '@inertiajs/react';
import { KpiGrid, type Kpi } from '@/components/shared/kpi-grid';
import { PageHeader } from '@/components/shared/page-header';
import { t } from '@/lib/i18n';

export default function AdminDashboard({ kpis }: { kpis: Kpi[] }) {
    const { auth } = usePage().props;
    return (
        <>
            <Head title={t('admin.dashboard.title')} />
            <PageHeader title={t('admin.dashboard.title')} description={t('admin.dashboard.welcome', { name: auth.user?.name ?? '' })} />
            <section aria-label={t('admin.dashboard.kpis')}>
                <KpiGrid kpis={kpis} />
            </section>
        </>
    );
}

AdminDashboard.layout = () => ({ breadcrumbs: [{ title: t('admin.dashboard.title'), href: '/admin/dashboard' }] });
