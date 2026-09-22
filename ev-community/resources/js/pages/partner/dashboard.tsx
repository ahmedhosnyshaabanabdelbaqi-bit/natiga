import { Head } from '@inertiajs/react';
import { KpiGrid, type Kpi } from '@/components/shared/kpi-grid';
import { PageHeader } from '@/components/shared/page-header';
import { t } from '@/lib/i18n';

export default function PartnerDashboard({ kpis, center }: { kpis: Kpi[]; center: { id: string; name: string } | null }) {
    return (
        <>
            <Head title={t('core.labels.dashboard')} />
            <PageHeader title={center?.name ?? t('core.labels.dashboard')} description={t('core.nav.partner_portal')} />
            <KpiGrid kpis={kpis} />
        </>
    );
}

PartnerDashboard.layout = () => ({ breadcrumbs: [{ title: t('core.labels.dashboard'), href: '/partner/dashboard' }] });
