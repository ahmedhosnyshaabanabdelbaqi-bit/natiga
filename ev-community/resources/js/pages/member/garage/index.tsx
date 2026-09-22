import { Head, Link, router } from '@inertiajs/react';
import { Car, Gauge, Plus, Star } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import type { StatusTone } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import type { GarageVehicleCard } from '@/features/garage/types';
import { VehicleImage } from '@/features/garage/vehicle-image';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { create, index, primary, show } from '@/routes/member/garage';

type Props = {
    vehicles: GarageVehicleCard[];
    counts: { active: number; inactive: number };
    canAdd: boolean;
};

export default function GarageIndex({ vehicles, counts, canAdd }: Props) {
    const [settingPrimary, setSettingPrimary] = useState<string | null>(null);

    const addButton = canAdd ? (
        <Button asChild>
            <Link href={create().url}>
                <Plus className="size-4" aria-hidden="true" />
                {t('garage.add_vehicle')}
            </Link>
        </Button>
    ) : null;

    return (
        <>
            <Head title={t('garage.title')} />
            <div className="space-y-6">
                <PageHeader
                    title={t('garage.title')}
                    description={
                        vehicles.length > 0
                            ? `${t('garage.counts.active', { count: counts.active })}${counts.inactive > 0 ? ` · ${t('garage.counts.inactive', { count: counts.inactive })}` : ''}`
                            : t('garage.subtitle')
                    }
                    actions={vehicles.length > 0 ? addButton : null}
                />

                {vehicles.length === 0 ? (
                    <EmptyState
                        icon={Car}
                        title={t('garage.empty.title')}
                        description={t('garage.empty.description')}
                        action={
                            canAdd ? (
                                <Button asChild>
                                    <Link href={create().url}>
                                        <Plus
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                        {t('garage.empty.cta')}
                                    </Link>
                                </Button>
                            ) : undefined
                        }
                    />
                ) : (
                    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {vehicles.map((vehicle) => (
                            <li key={vehicle.id}>
                                <Card className="h-full gap-0 overflow-hidden py-0 shadow-card transition hover:shadow-elevated">
                                    <Link
                                        href={show(vehicle.id).url}
                                        className="block focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                        aria-label={vehicle.display_name}
                                    >
                                        <div className="relative aspect-[16/9]">
                                            <VehicleImage
                                                src={vehicle.image_url}
                                                logo={vehicle.make.logo}
                                                alt={vehicle.display_name}
                                            />
                                            {vehicle.is_primary ? (
                                                <Badge className="absolute start-3 top-3 gap-1 bg-brand text-brand-foreground">
                                                    <Star
                                                        className="size-3"
                                                        aria-hidden="true"
                                                    />
                                                    {t('garage.primary.badge')}
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </Link>
                                    <CardContent className="space-y-2 p-4">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <h2 className="truncate font-semibold">
                                                    <Link
                                                        href={
                                                            show(vehicle.id).url
                                                        }
                                                        className="hover:underline"
                                                    >
                                                        {vehicle.nickname ??
                                                            `${vehicle.make.name} ${vehicle.model.name}`}
                                                    </Link>
                                                </h2>
                                                <p className="truncate text-sm text-muted-foreground">
                                                    {vehicle.make.name}{' '}
                                                    {vehicle.model.name} ·{' '}
                                                    {vehicle.year}
                                                    {vehicle.variant
                                                        ? ` · ${vehicle.variant.name}`
                                                        : ''}
                                                </p>
                                            </div>
                                            <StatusBadge
                                                status={vehicle.status.value}
                                                label={vehicle.status.label}
                                                tone={
                                                    vehicle.status
                                                        .color as StatusTone
                                                }
                                            />
                                        </div>
                                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                            <Gauge
                                                className="size-4"
                                                aria-hidden="true"
                                            />
                                            {vehicle.odometer_km !== null
                                                ? t('garage.info.km', {
                                                      value: formatNumber(
                                                          vehicle.odometer_km,
                                                          0,
                                                      ),
                                                  })
                                                : t('garage.card.no_odometer')}
                                        </p>
                                    </CardContent>
                                    <CardFooter className="mt-auto flex flex-wrap gap-2 border-t px-4 py-3">
                                        <Button
                                            asChild
                                            size="sm"
                                            variant="outline"
                                        >
                                            <Link href={show(vehicle.id).url}>
                                                {t('garage.card.view')}
                                            </Link>
                                        </Button>
                                        {vehicle.status.value === 'active' &&
                                        !vehicle.is_primary ? (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                disabled={
                                                    settingPrimary !== null
                                                }
                                                onClick={() =>
                                                    router.post(
                                                        primary(vehicle.id).url,
                                                        {},
                                                        {
                                                            preserveScroll: true,
                                                            onStart: () =>
                                                                setSettingPrimary(
                                                                    vehicle.id,
                                                                ),
                                                            onFinish: () =>
                                                                setSettingPrimary(
                                                                    null,
                                                                ),
                                                        },
                                                    )
                                                }
                                            >
                                                {settingPrimary ===
                                                vehicle.id ? (
                                                    <Spinner />
                                                ) : (
                                                    <Star
                                                        className="size-4"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                                {t('garage.primary.set')}
                                            </Button>
                                        ) : null}
                                    </CardFooter>
                                </Card>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </>
    );
}

GarageIndex.layout = () => ({
    breadcrumbs: [{ title: t('garage.title'), href: index().url }],
});
