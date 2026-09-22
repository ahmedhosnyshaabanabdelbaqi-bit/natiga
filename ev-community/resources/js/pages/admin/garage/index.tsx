import { Head, Link } from '@inertiajs/react';
import {
    Archive,
    BadgeCheck,
    Car,
    CircleSlash,
    Gauge,
    KeyRound,
    Tag,
    Users,
} from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { StatCard } from '@/components/shared/stat-card';
import { Button } from '@/components/ui/button';
import { RankedBars, YearColumns } from '@/features/garage/ranked-bars';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { index } from '@/routes/admin/garage';
import { index as membersIndex } from '@/routes/admin/vehicles/members';

type Stats = {
    totals: {
        all: number;
        active: number;
        sold: number;
        archived: number;
        without_variant: number;
        without_vin: number;
        with_odometer: number;
        members_with_vehicles: number;
    };
    top_models: {
        make_id: number;
        make: string;
        model_id: number;
        model: string;
        total: number;
    }[];
    by_make: { make_id: number; make: string; total: number }[];
    by_year: { year: number; total: number }[];
};

type Props = { stats: Stats; memberVehiclesUrl: string };

export default function AdminGarageOverview({
    stats,
    memberVehiclesUrl,
}: Props) {
    const { totals } = stats;
    const value = (n: number) => formatNumber(n, 0);

    return (
        <>
            <Head title={t('vehicles.admin.garage.title')} />
            <div className="space-y-6">
                <PageHeader
                    title={t('vehicles.admin.garage.title')}
                    description={t('vehicles.admin.garage.description')}
                    actions={
                        <Button asChild variant="outline">
                            <Link href={memberVehiclesUrl}>
                                {t(
                                    'vehicles.admin.garage.member_vehicles_link',
                                )}
                            </Link>
                        </Button>
                    }
                />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        label={t('vehicles.admin.garage.totals.active')}
                        value={value(totals.active)}
                        icon={Car}
                        tone="brand"
                        href={membersIndex({ query: { status: 'active' } }).url}
                    />
                    <StatCard
                        label={t(
                            'vehicles.admin.garage.totals.members_with_vehicles',
                        )}
                        value={value(totals.members_with_vehicles)}
                        icon={Users}
                    />
                    <StatCard
                        label={t('vehicles.admin.garage.totals.sold')}
                        value={value(totals.sold)}
                        icon={Tag}
                        href={membersIndex({ query: { status: 'sold' } }).url}
                    />
                    <StatCard
                        label={t('vehicles.admin.garage.totals.archived')}
                        value={value(totals.archived)}
                        icon={Archive}
                        href={
                            membersIndex({ query: { status: 'archived' } }).url
                        }
                    />
                    <StatCard
                        label={t(
                            'vehicles.admin.garage.totals.without_variant',
                        )}
                        value={value(totals.without_variant)}
                        hint={t('vehicles.admin.garage.hints.without_variant')}
                        icon={CircleSlash}
                        tone={
                            totals.without_variant > 0 ? 'warning' : 'default'
                        }
                        href={
                            membersIndex({
                                query: { status: 'active', variant: 'missing' },
                            }).url
                        }
                    />
                    <StatCard
                        label={t('vehicles.admin.garage.totals.without_vin')}
                        value={value(totals.without_vin)}
                        hint={t('vehicles.admin.garage.hints.active_only')}
                        icon={KeyRound}
                    />
                    <StatCard
                        label={t('vehicles.admin.garage.totals.with_odometer')}
                        value={value(totals.with_odometer)}
                        hint={t('vehicles.admin.garage.hints.active_only')}
                        icon={Gauge}
                    />
                    <StatCard
                        label={t('vehicles.admin.garage.totals.all')}
                        value={value(totals.all)}
                        icon={BadgeCheck}
                    />
                </div>

                {totals.all === 0 ? (
                    <EmptyState
                        icon={Car}
                        title={t('vehicles.admin.garage.title')}
                        description={t('vehicles.admin.garage.empty')}
                    />
                ) : (
                    <>
                        <div className="grid gap-4 lg:grid-cols-2">
                            <SectionCard
                                title={t('vehicles.admin.garage.top_models')}
                                description={t(
                                    'vehicles.admin.garage.hints.active_only',
                                )}
                            >
                                {stats.top_models.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        {t('vehicles.admin.garage.no_active')}
                                    </p>
                                ) : (
                                    <RankedBars
                                        caption={t(
                                            'vehicles.admin.garage.top_models',
                                        )}
                                        valueLabel={t(
                                            'vehicles.admin.garage.vehicles',
                                        )}
                                        items={stats.top_models.map((row) => ({
                                            key: `${row.make_id}-${row.model_id}`,
                                            label: row.model,
                                            sublabel: row.make,
                                            value: row.total,
                                            href: membersIndex({
                                                query: {
                                                    make: row.make_id,
                                                    model: row.model_id,
                                                    status: 'active',
                                                },
                                            }).url,
                                        }))}
                                    />
                                )}
                            </SectionCard>
                            <SectionCard
                                title={t('vehicles.admin.garage.by_make')}
                                description={t(
                                    'vehicles.admin.garage.hints.active_only',
                                )}
                            >
                                {stats.by_make.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        {t('vehicles.admin.garage.no_active')}
                                    </p>
                                ) : (
                                    <RankedBars
                                        caption={t(
                                            'vehicles.admin.garage.by_make',
                                        )}
                                        valueLabel={t(
                                            'vehicles.admin.garage.vehicles',
                                        )}
                                        items={stats.by_make.map((row) => ({
                                            key: String(row.make_id),
                                            label: row.make,
                                            value: row.total,
                                            href: membersIndex({
                                                query: {
                                                    make: row.make_id,
                                                    status: 'active',
                                                },
                                            }).url,
                                        }))}
                                    />
                                )}
                            </SectionCard>
                        </div>
                        <SectionCard
                            title={t('vehicles.admin.garage.by_year')}
                            description={t(
                                'vehicles.admin.garage.hints.active_only',
                            )}
                        >
                            {stats.by_year.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    {t('vehicles.admin.garage.no_active')}
                                </p>
                            ) : (
                                <YearColumns
                                    items={stats.by_year}
                                    caption={t('vehicles.admin.garage.by_year')}
                                    valueLabel={t(
                                        'vehicles.admin.garage.vehicles',
                                    )}
                                />
                            )}
                        </SectionCard>
                    </>
                )}
            </div>
        </>
    );
}

AdminGarageOverview.layout = () => ({
    breadcrumbs: [
        { title: t('vehicles.admin.garage.title'), href: index().url },
    ],
});
