import { Head, Link, useForm } from '@inertiajs/react';
import { Gauge, ShieldAlert, TrendingDown, UserRound } from 'lucide-react';
import type { FormEvent } from 'react';
import { DateTime } from '@/components/shared/date-time';
import { EmptyState } from '@/components/shared/empty-state';
import { FormActions, FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { DescriptionList, SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import type { StatusTone } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Code } from '@/components/ui/code';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type {
    GarageVehicleCard,
    InfoSectionData,
    OdometerEntry,
} from '@/features/garage/types';
import { VehicleImage } from '@/features/garage/vehicle-image';
import { findMake, findModel, findVariant } from '@/features/vehicles/catalog';
import { OptionSelect } from '@/features/vehicles/option-select';
import type { Option, VehicleCatalog } from '@/features/vehicles/types';
import {
    UNKNOWN_VARIANT,
    VehiclePicker,
} from '@/features/vehicles/vehicle-picker';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { index as makesIndex } from '@/routes/admin/vehicles';
import { index, show, update } from '@/routes/admin/vehicles/members';

type Vehicle = GarageVehicleCard & {
    member: {
        id: string | null;
        member_number: string | null;
        name: string | null;
    };
    plate_hint: string | null;
    battery_capacity_kwh: string | null;
    vehicle_make_id: number;
    vehicle_model_id: number;
    vehicle_variant_id: number | null;
    battery_variant_id: number | null;
    info: InfoSectionData;
};

type Props = {
    vehicle: Vehicle;
    odometerHistory: OdometerEntry[];
    memberUrl: string | null;
    canCorrect: boolean;
    catalog: VehicleCatalog | null;
    marketVersions: Option[];
    statuses: Option[];
};

function CorrectionForm({
    vehicle,
    catalog,
    marketVersions,
    statuses,
}: {
    vehicle: Vehicle;
    catalog: VehicleCatalog;
    marketVersions: Option[];
    statuses: Option[];
}) {
    const form = useForm({
        vehicle_make_id: vehicle.vehicle_make_id as number | null,
        vehicle_model_id: vehicle.vehicle_model_id as number | null,
        vehicle_variant_id: vehicle.vehicle_variant_id,
        year: vehicle.year as number | null,
        market_version: vehicle.market_version.value as string,
        battery_variant_id: vehicle.battery_variant_id
            ? String(vehicle.battery_variant_id)
            : '',
        status: vehicle.status.value as string,
        clear_vin: false,
        reason: '',
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.transform((data) => ({
            ...data,
            vehicle_variant_id: data.vehicle_variant_id ?? '',
            clear_vin: data.clear_vin ? 1 : 0,
        }));
        form.put(update(vehicle.id).url, {
            preserveScroll: true,
            onSuccess: () => form.setData('reason', ''),
        });
    };

    return (
        <form onSubmit={submit} className="space-y-4" noValidate>
            <VehiclePicker
                catalog={catalog}
                value={{
                    make_id: form.data.vehicle_make_id,
                    model_id: form.data.vehicle_model_id,
                    variant_id: form.data.vehicle_variant_id,
                    year: form.data.year,
                }}
                yearRequired
                idPrefix="correct"
                errors={{
                    make: form.errors.vehicle_make_id,
                    model: form.errors.vehicle_model_id,
                    variant: form.errors.vehicle_variant_id,
                    year: form.errors.year,
                }}
                onChange={(next) => {
                    const variant = findVariant(
                        findModel(
                            findMake(catalog, next.make_id),
                            next.model_id,
                        ),
                        next.variant_id,
                    );
                    form.setData((current) => ({
                        ...current,
                        vehicle_make_id: next.make_id,
                        vehicle_model_id: next.model_id,
                        vehicle_variant_id: next.variant_id,
                        year: next.year,
                        market_version:
                            variant &&
                            next.variant_id !== current.vehicle_variant_id
                                ? variant.market_version
                                : current.market_version,
                    }));
                }}
            />
            <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                    id="correct-market"
                    label={t('vehicles.fields.market_version')}
                    required
                    error={form.errors.market_version}
                >
                    <OptionSelect
                        value={form.data.market_version}
                        options={marketVersions}
                        onChange={(value) =>
                            form.setData('market_version', value)
                        }
                    />
                </FormField>
                <FormField
                    id="correct-battery"
                    label={t('vehicles.fields.battery')}
                    optional
                    error={form.errors.battery_variant_id}
                >
                    <OptionSelect
                        value={form.data.battery_variant_id || UNKNOWN_VARIANT}
                        options={[
                            {
                                value: UNKNOWN_VARIANT,
                                label: t('vehicles.selector.unknown_battery'),
                            },
                            ...catalog.battery_variants.map((battery) => ({
                                value: String(battery.id),
                                label: battery.name,
                            })),
                        ]}
                        onChange={(value) =>
                            form.setData(
                                'battery_variant_id',
                                value === UNKNOWN_VARIANT ? '' : value,
                            )
                        }
                    />
                </FormField>
                <FormField
                    id="correct-status"
                    label={t('core.labels.status')}
                    required
                    error={form.errors.status}
                >
                    <OptionSelect
                        value={form.data.status}
                        options={statuses}
                        onChange={(value) => form.setData('status', value)}
                    />
                </FormField>
            </div>
            {vehicle.has_vin ? (
                <div className="flex items-start gap-2">
                    <Checkbox
                        id="correct-clear-vin"
                        checked={form.data.clear_vin}
                        onCheckedChange={(checked) =>
                            form.setData('clear_vin', checked === true)
                        }
                    />
                    <div className="grid gap-1">
                        <Label htmlFor="correct-clear-vin">
                            {t('vehicles.admin.members.clear_vin_label')}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            {t('vehicles.admin.members.clear_vin_hint')}
                        </p>
                    </div>
                </div>
            ) : null}
            {(form.errors as Record<string, string | undefined>).vin ? (
                <InlineAlert tone="danger">
                    {(form.errors as Record<string, string | undefined>).vin}
                </InlineAlert>
            ) : null}
            <FormField
                id="correct-reason"
                label={t('core.labels.reason')}
                required
                hint={t('vehicles.admin.members.reason_hint')}
                error={form.errors.reason}
            >
                <Textarea
                    rows={2}
                    minLength={5}
                    maxLength={500}
                    value={form.data.reason}
                    onChange={(event) =>
                        form.setData('reason', event.target.value)
                    }
                />
            </FormField>
            <FormActions>
                <Button
                    type="submit"
                    disabled={
                        form.processing ||
                        form.data.reason.trim().length < 5 ||
                        !form.data.vehicle_model_id ||
                        !form.data.year
                    }
                >
                    {form.processing ? <Spinner /> : null}
                    {t('vehicles.admin.members.save_correction')}
                </Button>
            </FormActions>
        </form>
    );
}

export default function AdminMemberVehicleShow({
    vehicle,
    odometerHistory,
    memberUrl,
    canCorrect,
    catalog,
    marketVersions,
    statuses,
}: Props) {
    const info = vehicle.info;
    return (
        <>
            <Head title={vehicle.display_name} />
            <div className="space-y-6">
                <PageHeader
                    title={vehicle.display_name}
                    description={`${vehicle.make.name} ${vehicle.model.name} · ${vehicle.year}`}
                    actions={
                        memberUrl ? (
                            <Button asChild variant="outline">
                                <Link href={memberUrl}>
                                    <UserRound
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('vehicles.admin.members.view_member')}
                                </Link>
                            </Button>
                        ) : null
                    }
                >
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge
                            status={vehicle.status.value}
                            label={vehicle.status.label}
                            tone={vehicle.status.color as StatusTone}
                        />
                        {vehicle.is_primary ? (
                            <Badge variant="secondary">
                                {t('garage.primary.badge')}
                            </Badge>
                        ) : null}
                    </div>
                </PageHeader>

                <div className="grid gap-4 lg:grid-cols-3">
                    <SectionCard
                        title={t('vehicles.admin.members.detail')}
                        className="lg:col-span-2"
                    >
                        <DescriptionList
                            items={[
                                {
                                    label: t('vehicles.fields.member'),
                                    value: vehicle.member.name,
                                },
                                {
                                    label: t('vehicles.fields.member_number'),
                                    value: vehicle.member.member_number,
                                    type: 'code',
                                },
                                {
                                    label: t('vehicles.fields.make'),
                                    value: info.make,
                                },
                                {
                                    label: t('vehicles.fields.model'),
                                    value: info.model,
                                },
                                {
                                    label: t('vehicles.fields.variant'),
                                    value:
                                        info.variant ??
                                        t('vehicles.selector.unknown_variant'),
                                },
                                {
                                    label: t('vehicles.fields.year'),
                                    value: String(info.year),
                                },
                                {
                                    label: t('vehicles.fields.market_version'),
                                    value: info.market_version,
                                },
                                {
                                    label: t(
                                        'vehicles.fields.battery_capacity_kwh',
                                    ),
                                    value: info.battery_capacity_kwh
                                        ? formatNumber(
                                              info.battery_capacity_kwh,
                                              2,
                                          )
                                        : null,
                                },
                                {
                                    label: t('garage.info.ac_port'),
                                    value: info.connectors.ac?.name ?? null,
                                },
                                {
                                    label: t('garage.info.dc_port'),
                                    value: info.connectors.dc?.name ?? null,
                                },
                                {
                                    label: t('vehicles.fields.nickname'),
                                    value: vehicle.nickname,
                                },
                                {
                                    label: t('vehicles.fields.color'),
                                    value: vehicle.color,
                                },
                                {
                                    label: t('vehicles.fields.plate_hint'),
                                    value: vehicle.plate_hint,
                                    type: 'code',
                                },
                                {
                                    label: t('core.labels.created_at'),
                                    value: vehicle.created_at,
                                    type: 'date',
                                },
                                {
                                    label: t('vehicles.fields.vin'),
                                    full: true,
                                    value: vehicle.has_vin ? (
                                        <span className="inline-flex flex-wrap items-center gap-2">
                                            <Code>{info.vin_masked}</Code>
                                            <span className="text-xs text-muted-foreground">
                                                {t(
                                                    'vehicles.admin.members.vin_hidden',
                                                )}
                                            </span>
                                        </span>
                                    ) : (
                                        t('garage.info.no_vin')
                                    ),
                                },
                            ]}
                        />
                    </SectionCard>
                    <div className="overflow-hidden rounded-xl border bg-card shadow-card">
                        <div className="aspect-[4/3]">
                            <VehicleImage
                                src={vehicle.image_url}
                                logo={vehicle.make.logo}
                                alt={vehicle.display_name}
                            />
                        </div>
                        <div className="flex items-center gap-2 border-t p-4 text-sm">
                            <Gauge
                                className="size-4 text-muted-foreground"
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
                        </div>
                    </div>
                </div>

                <SectionCard
                    title={t('vehicles.admin.members.odometer_history')}
                    flush={odometerHistory.length > 0}
                >
                    {odometerHistory.length === 0 ? (
                        <EmptyState
                            icon={Gauge}
                            title={t('vehicles.admin.members.odometer_history')}
                            description={t('vehicles.admin.members.no_history')}
                            className="border-0"
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>
                                        {t('core.labels.date')}
                                    </TableHead>
                                    <TableHead className="text-end">
                                        {t('garage.odometer.reading')}
                                    </TableHead>
                                    <TableHead>
                                        {t('core.labels.source')}
                                    </TableHead>
                                    <TableHead className="hidden md:table-cell">
                                        {t(
                                            'vehicles.admin.members.recorded_by',
                                        )}
                                    </TableHead>
                                    <TableHead>
                                        {t('core.labels.notes')}
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {odometerHistory.map((entry) => (
                                    <TableRow key={entry.id}>
                                        <TableCell className="whitespace-nowrap">
                                            <DateTime
                                                value={entry.recorded_at}
                                            />
                                        </TableCell>
                                        <TableCell className="tabular text-end whitespace-nowrap">
                                            {entry.is_decrease ? (
                                                <TrendingDown
                                                    className="me-1 inline size-3.5 text-warning"
                                                    aria-label={t(
                                                        'garage.odometer.decrease',
                                                    )}
                                                />
                                            ) : null}
                                            {formatNumber(entry.odometer_km, 0)}
                                        </TableCell>
                                        <TableCell>
                                            {entry.source.label}
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">
                                            {entry.created_by ?? '—'}
                                        </TableCell>
                                        <TableCell className="max-w-72 text-sm break-words text-muted-foreground">
                                            {entry.note ?? '—'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </SectionCard>

                {canCorrect && catalog ? (
                    <SectionCard
                        title={t('vehicles.admin.members.correct_title')}
                        description={t(
                            'vehicles.admin.members.correct_description',
                        )}
                        actions={
                            <ShieldAlert
                                className="size-5 text-warning"
                                aria-hidden="true"
                            />
                        }
                    >
                        <CorrectionForm
                            vehicle={vehicle}
                            catalog={catalog}
                            marketVersions={marketVersions}
                            statuses={statuses}
                        />
                    </SectionCard>
                ) : null}
            </div>
        </>
    );
}

AdminMemberVehicleShow.layout = (props: Props) => ({
    breadcrumbs: [
        { title: t('vehicles.admin.title'), href: makesIndex().url },
        { title: t('vehicles.admin.members.title'), href: index().url },
        { title: props.vehicle.display_name, href: show(props.vehicle.id).url },
    ],
});
