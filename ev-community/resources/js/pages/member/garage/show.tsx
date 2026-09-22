import { Head, Link, router, usePage } from '@inertiajs/react';
import { Gauge, Pencil, Star, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DateTime } from '@/components/shared/date-time';
import { InlineAlert } from '@/components/shared/inline-alert';
import { StatusBadge } from '@/components/shared/status-badge';
import type { StatusTone } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OdometerDialog } from '@/features/garage/odometer-dialog';
import { GarageSectionRenderer } from '@/features/garage/section-renderer';
import { StatusDialog } from '@/features/garage/status-dialog';
import type {
    GarageSectionTab,
    GarageVehicleDetail,
    LabeledValue,
} from '@/features/garage/types';
import { VehicleImage } from '@/features/garage/vehicle-image';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { destroy, edit, index, primary, show } from '@/routes/member/garage';

type Props = {
    vehicle: GarageVehicleDetail;
    sections: GarageSectionTab[];
    activeSection: string | null;
    statuses: LabeledValue[];
    canUpdate: boolean;
    canDelete: boolean;
    canRevealVin: boolean;
};

type SectionData = Record<string, unknown> | null;

export default function GarageShow({
    vehicle,
    sections,
    activeSection,
    statuses,
    canUpdate,
    canDelete,
}: Props) {
    const page = usePage();
    const props = page.props as Record<string, unknown>;
    const [tab, setTab] = useState<string | null>(activeSection);
    const [failed, setFailed] = useState<Record<string, boolean>>({});
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [settingPrimary, setSettingPrimary] = useState(false);
    // Section props are lazy (Inertia optional props): each tab's data is fetched with a partial reload the
    // first time it is shown, so heavy sections of other modules never block the page.
    const inflight = useRef(new Set<string>());

    const sectionData = (key: string): SectionData | undefined => {
        const value = props[`section_${key}`];
        return value === undefined ? undefined : (value as SectionData);
    };

    const load = useCallback((key: string, syncUrl = true) => {
        if (inflight.current.has(key)) {
            return;
        }
        inflight.current.add(key);
        const fail = () =>
            setFailed((current) => ({ ...current, [key]: true }));
        setFailed((current) => ({ ...current, [key]: false }));
        router.reload({
            only: [`section_${key}`],
            // Keep ?tab= in the URL so reloads/redirects reopen the same tab.
            data: syncUrl ? { tab: key } : {},
            replace: true,
            onError: fail,
            onHttpException: () => {
                fail();
                return false;
            },
            onNetworkError: () => {
                fail();
                return false;
            },
            onFinish: () => {
                inflight.current.delete(key);
            },
        });
    }, []);

    const activeLoaded =
        activeSection !== null &&
        props[`section_${activeSection}`] !== undefined;
    useEffect(() => {
        if (activeSection && !activeLoaded) {
            load(activeSection, false);
        }
    }, [activeSection, activeLoaded, load]);

    const onTabChange = (key: string) => {
        setTab(key);
        if (sectionData(key) === undefined) {
            load(key);
        }
    };

    const isActive = vehicle.status.value === 'active';

    return (
        <>
            <Head title={vehicle.display_name} />
            <div className="space-y-6">
                <Card className="gap-0 overflow-hidden py-0 shadow-card">
                    <div className="grid md:grid-cols-[18rem_1fr]">
                        <div className="aspect-[16/10] md:aspect-auto md:min-h-48">
                            <VehicleImage
                                src={vehicle.image_url}
                                logo={vehicle.make.logo}
                                alt={vehicle.display_name}
                            />
                        </div>
                        <CardContent className="flex flex-col gap-4 p-4 md:p-6">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
                                            {vehicle.nickname ??
                                                `${vehicle.make.name} ${vehicle.model.name}`}
                                        </h1>
                                        <StatusBadge
                                            status={vehicle.status.value}
                                            label={vehicle.status.label}
                                            tone={
                                                vehicle.status
                                                    .color as StatusTone
                                            }
                                        />
                                        {vehicle.is_primary ? (
                                            <Badge className="gap-1 bg-brand text-brand-foreground">
                                                <Star
                                                    className="size-3"
                                                    aria-hidden="true"
                                                />
                                                {t('garage.primary.badge')}
                                            </Badge>
                                        ) : null}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {vehicle.make.name} {vehicle.model.name}{' '}
                                        · {vehicle.year}
                                        {vehicle.variant
                                            ? ` · ${vehicle.variant.name}`
                                            : ''}{' '}
                                        · {vehicle.market_version.label}
                                    </p>
                                </div>
                                {canUpdate ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            asChild
                                            variant="outline"
                                            size="sm"
                                        >
                                            <Link href={edit(vehicle.id).url}>
                                                <Pencil
                                                    className="size-4"
                                                    aria-hidden="true"
                                                />
                                                {t('core.actions.edit')}
                                            </Link>
                                        </Button>
                                        <StatusDialog
                                            vehicleId={vehicle.id}
                                            current={vehicle.status.value}
                                            statuses={statuses}
                                        />
                                        {isActive && !vehicle.is_primary ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={settingPrimary}
                                                onClick={() =>
                                                    router.post(
                                                        primary(vehicle.id).url,
                                                        {},
                                                        {
                                                            preserveScroll: true,
                                                            onStart: () =>
                                                                setSettingPrimary(
                                                                    true,
                                                                ),
                                                            onFinish: () =>
                                                                setSettingPrimary(
                                                                    false,
                                                                ),
                                                        },
                                                    )
                                                }
                                            >
                                                {settingPrimary ? (
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
                                    </div>
                                ) : null}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                                <Gauge
                                    className="size-5 text-muted-foreground"
                                    aria-hidden="true"
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs text-muted-foreground">
                                        {t('garage.odometer.current')}
                                    </p>
                                    <p className="tabular font-semibold">
                                        {vehicle.odometer_km !== null
                                            ? t('garage.info.km', {
                                                  value: formatNumber(
                                                      vehicle.odometer_km,
                                                      0,
                                                  ),
                                              })
                                            : t('garage.card.no_odometer')}
                                        {vehicle.odometer_updated_at ? (
                                            <span className="ms-2 text-xs font-normal text-muted-foreground">
                                                <DateTime
                                                    value={
                                                        vehicle.odometer_updated_at
                                                    }
                                                    mode="relative"
                                                />
                                            </span>
                                        ) : null}
                                    </p>
                                </div>
                                {canUpdate && isActive ? (
                                    <OdometerDialog
                                        vehicleId={vehicle.id}
                                        currentKm={vehicle.odometer_km}
                                    />
                                ) : null}
                            </div>

                            {!isActive ? (
                                <InlineAlert tone="info">
                                    {t('garage.status.inactive_notice')}
                                </InlineAlert>
                            ) : null}
                        </CardContent>
                    </div>
                </Card>

                {sections.length > 0 && tab ? (
                    <Tabs
                        value={tab}
                        onValueChange={onTabChange}
                        className="gap-4"
                    >
                        <TabsList className="h-auto w-full flex-wrap justify-start">
                            {sections.map((section) => (
                                <TabsTrigger
                                    key={section.key}
                                    value={section.key}
                                    className="flex-none"
                                >
                                    {section.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        {sections.map((section) => (
                            <TabsContent key={section.key} value={section.key}>
                                {failed[section.key] ? (
                                    <GarageSectionRenderer
                                        sectionKey={section.key}
                                        label={section.label}
                                        data={{
                                            error: t('garage.section.error'),
                                        }}
                                        vehicle={vehicle}
                                        canUpdate={canUpdate}
                                        onRetry={() => load(section.key)}
                                    />
                                ) : (
                                    <GarageSectionRenderer
                                        sectionKey={section.key}
                                        label={section.label}
                                        data={sectionData(section.key)}
                                        vehicle={vehicle}
                                        canUpdate={canUpdate}
                                        onRetry={() => load(section.key)}
                                    />
                                )}
                            </TabsContent>
                        ))}
                    </Tabs>
                ) : null}

                {canDelete ? (
                    <Card className="border-danger/30 shadow-none">
                        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                            <div className="min-w-0">
                                <p className="font-medium">
                                    {t('garage.delete.action')}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {vehicle.can_delete
                                        ? t('garage.delete.description')
                                        : vehicle.delete_blocked_reason}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="destructive"
                                disabled={!vehicle.can_delete || deleting}
                                onClick={() => setConfirmDelete(true)}
                            >
                                <Trash2 className="size-4" aria-hidden="true" />
                                {t('garage.delete.action')}
                            </Button>
                        </CardContent>
                    </Card>
                ) : null}
            </div>

            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title={t('garage.delete.title')}
                description={t('garage.delete.description')}
                confirmLabel={t('garage.delete.action')}
                destructive
                processing={deleting}
                onConfirm={() =>
                    router.delete(destroy(vehicle.id).url, {
                        onStart: () => setDeleting(true),
                        onFinish: () => {
                            setDeleting(false);
                            setConfirmDelete(false);
                        },
                    })
                }
            />
        </>
    );
}

GarageShow.layout = (props: Props) => ({
    breadcrumbs: [
        { title: t('garage.title'), href: index().url },
        { title: props.vehicle.display_name, href: show(props.vehicle.id).url },
    ],
});
