import { Head, Link, usePage } from '@inertiajs/react';
import { Car, IdCard } from 'lucide-react';
import { DateTime } from '@/components/shared/date-time';
import { KpiGrid, type Kpi } from '@/components/shared/kpi-grid';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Code } from '@/components/ui/code';
import { t } from '@/lib/i18n';

type Props = { membership: { member_number: string; status: string; joined_at: string | null }; kpis: Kpi[] };

export default function MemberDashboard({ membership, kpis }: Props) {
    const { auth, modules } = usePage().props;
    return (
        <>
            <Head title={t('core.labels.dashboard')} />
            <PageHeader title={t('admin.dashboard.welcome', { name: auth.user?.name ?? '' })} description={t('core.home.hero_title')} />
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="shadow-card md:col-span-2">
                    <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                        <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase">{t('core.nav.membership_card')}</p>
                            <p className="mt-1 text-lg font-semibold">
                                <Code>{membership.member_number}</Code>
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                <StatusBadge status={membership.status} label={t(`members.status.${membership.status}`)} /> · <DateTime value={membership.joined_at} mode="date" />
                            </p>
                        </div>
                        <Button asChild variant="outline">
                            <Link href="/account/membership-card"><IdCard className="size-4" />{t('core.nav.membership_card')}</Link>
                        </Button>
                    </CardContent>
                </Card>
                {modules.garage !== false ? (
                    <Card className="shadow-card">
                        <CardContent className="flex h-full flex-col justify-between gap-3 p-5">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase">{t('core.nav.my_garage')}</p>
                                <p className="mt-1 text-sm text-muted-foreground">{t('core.home.select_vehicle')}</p>
                            </div>
                            <Button asChild>
                                <Link href="/account/garage"><Car className="size-4" />{t('core.nav.my_garage')}</Link>
                            </Button>
                        </CardContent>
                    </Card>
                ) : null}
            </div>
            <KpiGrid kpis={kpis} />
        </>
    );
}

MemberDashboard.layout = () => ({ breadcrumbs: [{ title: t('core.labels.dashboard'), href: '/account' }] });
