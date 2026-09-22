import { Head, router, useForm } from '@inertiajs/react';
import { Battery, Pencil, Plus, Rows3 } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
    ActiveToggle,
    DeleteRowButton,
    DomainErrorAlert,
} from '@/features/vehicles/admin-actions';
import { VehiclesAdminNav } from '@/features/vehicles/admin-nav';
import { yearRange } from '@/features/vehicles/catalog';
import { OptionSelect } from '@/features/vehicles/option-select';
import type { Option } from '@/features/vehicles/types';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { index as makesIndex } from '@/routes/admin/vehicles';
import {
    destroy as destroyBattery,
    store as storeBattery,
    update as updateBattery,
} from '@/routes/admin/vehicles/batteries';
import {
    destroy,
    index,
    store,
    toggle,
    update,
} from '@/routes/admin/vehicles/variants';

type Variant = {
    id: number;
    vehicle_model_id: number;
    make_name: string;
    model_name: string;
    name_ar: string;
    name_en: string;
    name: string;
    trim: string | null;
    market_version: string;
    market_version_label: string;
    year_from: number;
    year_to: number | null;
    battery_variant_id: number | null;
    battery_name: string | null;
    ac_connector_type_id: number | null;
    dc_connector_type_id: number | null;
    ac_connector: string | null;
    dc_connector: string | null;
    battery_capacity_kwh: string | null;
    motor_kw: number | null;
    range_km_wltp: number | null;
    notes: string | null;
    is_active: boolean;
    sort_order: number;
    vehicles_count: number;
};

type BatteryRow = {
    id: number;
    name: string;
    capacity_kwh: string;
    chemistry: string | null;
    notes: string | null;
};
type ConnectorRow = {
    id: number;
    code: string;
    name: string;
    current_type: 'ac' | 'dc';
    is_active: boolean;
};

type Props = {
    makes: { id: number; name: string }[];
    models: { id: number; vehicle_make_id: number; name: string }[];
    variants: Variant[];
    batteries: BatteryRow[];
    connectors: ConnectorRow[];
    marketVersions: Option[];
    chemistries: string[];
    filters: { make: number | null; model: number | null };
    canManage: boolean;
};

const NONE = 'none';
const ALL = 'all';

const toStr = (value: number | string | null | undefined) =>
    value === null || value === undefined ? '' : String(value);

function VariantDialog({
    variant,
    props,
    onClose,
}: {
    variant: Variant | null;
    props: Props;
    onClose: () => void;
}) {
    const form = useForm({
        vehicle_model_id: toStr(
            variant?.vehicle_model_id ?? props.filters.model,
        ),
        name_ar: variant?.name_ar ?? '',
        name_en: variant?.name_en ?? '',
        trim: variant?.trim ?? '',
        market_version: variant?.market_version ?? 'europe',
        year_from: toStr(variant?.year_from),
        year_to: toStr(variant?.year_to),
        battery_variant_id: toStr(variant?.battery_variant_id),
        ac_connector_type_id: toStr(variant?.ac_connector_type_id),
        dc_connector_type_id: toStr(variant?.dc_connector_type_id),
        battery_capacity_kwh: variant?.battery_capacity_kwh ?? '',
        motor_kw: toStr(variant?.motor_kw),
        range_km_wltp: toStr(variant?.range_km_wltp),
        notes: variant?.notes ?? '',
        sort_order: toStr(variant?.sort_order ?? 0),
        is_active: variant?.is_active ?? true,
    });
    const connectorOptions = (current: 'ac' | 'dc') => [
        { value: NONE, label: t('core.labels.none') },
        ...props.connectors
            .filter((connector) => connector.current_type === current)
            .map((connector) => ({
                value: String(connector.id),
                label: connector.name,
            })),
    ];

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const options = { preserveScroll: true, onSuccess: onClose };
        if (variant) {
            form.put(update(variant.id).url, options);
        } else {
            form.post(store().url, options);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
            <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
                <form onSubmit={submit} className="grid gap-4" noValidate>
                    <DialogHeader>
                        <DialogTitle>
                            {variant
                                ? t('vehicles.admin.variants.edit')
                                : t('vehicles.admin.variants.add')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('vehicles.hints.spec_approximate')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                            id="variant-model"
                            label={t('vehicles.fields.model')}
                            required
                            error={form.errors.vehicle_model_id}
                            className="sm:col-span-2"
                        >
                            <OptionSelect
                                value={form.data.vehicle_model_id}
                                placeholder={t(
                                    'vehicles.admin.variants.select_model',
                                )}
                                options={props.models.map((model) => ({
                                    value: String(model.id),
                                    label: `${props.makes.find((make) => make.id === model.vehicle_make_id)?.name ?? ''} ${model.name}`.trim(),
                                }))}
                                onChange={(value) =>
                                    form.setData('vehicle_model_id', value)
                                }
                            />
                        </FormField>
                        <FormField
                            id="variant-name-ar"
                            label={t('vehicles.fields.name_ar')}
                            required
                            error={form.errors.name_ar}
                        >
                            <Input
                                dir="rtl"
                                maxLength={160}
                                value={form.data.name_ar}
                                onChange={(event) =>
                                    form.setData('name_ar', event.target.value)
                                }
                            />
                        </FormField>
                        <FormField
                            id="variant-name-en"
                            label={t('vehicles.fields.name_en')}
                            required
                            error={form.errors.name_en}
                        >
                            <Input
                                dir="ltr"
                                maxLength={160}
                                value={form.data.name_en}
                                onChange={(event) =>
                                    form.setData('name_en', event.target.value)
                                }
                            />
                        </FormField>
                        <FormField
                            id="variant-trim"
                            label={t('vehicles.fields.trim')}
                            optional
                            error={form.errors.trim}
                        >
                            <Input
                                dir="ltr"
                                maxLength={80}
                                value={form.data.trim}
                                onChange={(event) =>
                                    form.setData('trim', event.target.value)
                                }
                            />
                        </FormField>
                        <FormField
                            id="variant-market"
                            label={t('vehicles.fields.market_version')}
                            required
                            error={form.errors.market_version}
                        >
                            <OptionSelect
                                value={form.data.market_version}
                                options={props.marketVersions}
                                onChange={(value) =>
                                    form.setData('market_version', value)
                                }
                            />
                        </FormField>
                        <FormField
                            id="variant-year-from"
                            label={t('vehicles.fields.year_from')}
                            required
                            error={form.errors.year_from}
                        >
                            <Input
                                type="number"
                                dir="ltr"
                                min={2008}
                                max={2035}
                                value={form.data.year_from}
                                onChange={(event) =>
                                    form.setData(
                                        'year_from',
                                        event.target.value,
                                    )
                                }
                            />
                        </FormField>
                        <FormField
                            id="variant-year-to"
                            label={t('vehicles.fields.year_to')}
                            optional
                            hint={t('vehicles.hints.year_to')}
                            error={form.errors.year_to}
                        >
                            <Input
                                type="number"
                                dir="ltr"
                                min={2008}
                                max={2035}
                                value={form.data.year_to}
                                onChange={(event) =>
                                    form.setData('year_to', event.target.value)
                                }
                            />
                        </FormField>
                        <FormField
                            id="variant-ac"
                            label={t('vehicles.fields.ac_connector')}
                            optional
                            error={form.errors.ac_connector_type_id}
                        >
                            <OptionSelect
                                value={form.data.ac_connector_type_id || NONE}
                                options={connectorOptions('ac')}
                                onChange={(value) =>
                                    form.setData(
                                        'ac_connector_type_id',
                                        value === NONE ? '' : value,
                                    )
                                }
                            />
                        </FormField>
                        <FormField
                            id="variant-dc"
                            label={t('vehicles.fields.dc_connector')}
                            optional
                            error={form.errors.dc_connector_type_id}
                        >
                            <OptionSelect
                                value={form.data.dc_connector_type_id || NONE}
                                options={connectorOptions('dc')}
                                onChange={(value) =>
                                    form.setData(
                                        'dc_connector_type_id',
                                        value === NONE ? '' : value,
                                    )
                                }
                            />
                        </FormField>
                        <FormField
                            id="variant-battery"
                            label={t('vehicles.fields.battery')}
                            optional
                            error={form.errors.battery_variant_id}
                        >
                            <OptionSelect
                                value={form.data.battery_variant_id || NONE}
                                options={[
                                    {
                                        value: NONE,
                                        label: t('core.labels.none'),
                                    },
                                    ...props.batteries.map((battery) => ({
                                        value: String(battery.id),
                                        label: battery.name,
                                    })),
                                ]}
                                onChange={(value) =>
                                    form.setData(
                                        'battery_variant_id',
                                        value === NONE ? '' : value,
                                    )
                                }
                            />
                        </FormField>
                        <FormField
                            id="variant-kwh"
                            label={t('vehicles.fields.battery_capacity_kwh')}
                            optional
                            hint={t('vehicles.hints.capacity_from_battery')}
                            error={form.errors.battery_capacity_kwh}
                        >
                            <Input
                                type="number"
                                dir="ltr"
                                step="0.01"
                                min={1}
                                max={500}
                                value={form.data.battery_capacity_kwh}
                                onChange={(event) =>
                                    form.setData(
                                        'battery_capacity_kwh',
                                        event.target.value,
                                    )
                                }
                            />
                        </FormField>
                        <FormField
                            id="variant-motor"
                            label={t('vehicles.fields.motor_kw')}
                            optional
                            error={form.errors.motor_kw}
                        >
                            <Input
                                type="number"
                                dir="ltr"
                                min={1}
                                max={2000}
                                value={form.data.motor_kw}
                                onChange={(event) =>
                                    form.setData('motor_kw', event.target.value)
                                }
                            />
                        </FormField>
                        <FormField
                            id="variant-range"
                            label={t('vehicles.fields.range_km_wltp')}
                            optional
                            error={form.errors.range_km_wltp}
                        >
                            <Input
                                type="number"
                                dir="ltr"
                                min={1}
                                max={2000}
                                value={form.data.range_km_wltp}
                                onChange={(event) =>
                                    form.setData(
                                        'range_km_wltp',
                                        event.target.value,
                                    )
                                }
                            />
                        </FormField>
                        <FormField
                            id="variant-notes"
                            label={t('vehicles.fields.notes')}
                            optional
                            error={form.errors.notes}
                            className="sm:col-span-2"
                        >
                            <Textarea
                                rows={2}
                                maxLength={1000}
                                value={form.data.notes}
                                onChange={(event) =>
                                    form.setData('notes', event.target.value)
                                }
                            />
                        </FormField>
                        <FormField
                            id="variant-sort"
                            label={t('vehicles.fields.sort_order')}
                            optional
                            error={form.errors.sort_order}
                        >
                            <Input
                                type="number"
                                dir="ltr"
                                min={-1000}
                                max={1000}
                                value={form.data.sort_order}
                                onChange={(event) =>
                                    form.setData(
                                        'sort_order',
                                        event.target.value,
                                    )
                                }
                            />
                        </FormField>
                        <FormField
                            id="variant-active"
                            label={t('vehicles.fields.is_active')}
                            inline
                            error={form.errors.is_active}
                        >
                            <Switch
                                checked={form.data.is_active}
                                onCheckedChange={(checked) =>
                                    form.setData('is_active', checked)
                                }
                            />
                        </FormField>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={form.processing}
                        >
                            {t('core.actions.cancel')}
                        </Button>
                        <Button type="submit" disabled={form.processing}>
                            {form.processing ? <Spinner /> : null}
                            {t('core.actions.save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function BatteryDialog({
    battery,
    chemistries,
    onClose,
}: {
    battery: BatteryRow | null;
    chemistries: string[];
    onClose: () => void;
}) {
    const form = useForm({
        name: battery?.name ?? '',
        capacity_kwh: battery?.capacity_kwh ?? '',
        chemistry: battery?.chemistry ?? '',
        notes: battery?.notes ?? '',
    });
    const submit = (event: FormEvent) => {
        event.preventDefault();
        const options = { preserveScroll: true, onSuccess: onClose };
        if (battery) {
            form.put(updateBattery(battery.id).url, options);
        } else {
            form.post(storeBattery().url, options);
        }
    };
    return (
        <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
            <DialogContent>
                <form onSubmit={submit} className="grid gap-4" noValidate>
                    <DialogHeader>
                        <DialogTitle>
                            {battery
                                ? t('vehicles.admin.batteries.edit')
                                : t('vehicles.admin.batteries.add')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('vehicles.hints.spec_approximate')}
                        </DialogDescription>
                    </DialogHeader>
                    <FormField
                        id="battery-name"
                        label={t('core.labels.name')}
                        required
                        error={form.errors.name}
                    >
                        <Input
                            dir="ltr"
                            maxLength={120}
                            value={form.data.name}
                            onChange={(event) =>
                                form.setData('name', event.target.value)
                            }
                        />
                    </FormField>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                            id="battery-capacity"
                            label={t('vehicles.fields.capacity_kwh')}
                            required
                            error={form.errors.capacity_kwh}
                        >
                            <Input
                                type="number"
                                dir="ltr"
                                step="0.01"
                                min={1}
                                max={500}
                                value={form.data.capacity_kwh}
                                onChange={(event) =>
                                    form.setData(
                                        'capacity_kwh',
                                        event.target.value,
                                    )
                                }
                            />
                        </FormField>
                        <FormField
                            id="battery-chemistry"
                            label={t('vehicles.fields.chemistry')}
                            optional
                            error={form.errors.chemistry}
                        >
                            <OptionSelect
                                value={form.data.chemistry || NONE}
                                options={[
                                    {
                                        value: NONE,
                                        label: t('core.labels.unknown'),
                                    },
                                    ...chemistries.map((chemistry) => ({
                                        value: chemistry,
                                        label:
                                            chemistry === 'other'
                                                ? t('vehicles.chemistry_other')
                                                : chemistry,
                                    })),
                                ]}
                                onChange={(value) =>
                                    form.setData(
                                        'chemistry',
                                        value === NONE ? '' : value,
                                    )
                                }
                            />
                        </FormField>
                    </div>
                    <FormField
                        id="battery-notes"
                        label={t('vehicles.fields.notes')}
                        optional
                        error={form.errors.notes}
                    >
                        <Textarea
                            rows={2}
                            maxLength={500}
                            value={form.data.notes}
                            onChange={(event) =>
                                form.setData('notes', event.target.value)
                            }
                        />
                    </FormField>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={form.processing}
                        >
                            {t('core.actions.cancel')}
                        </Button>
                        <Button type="submit" disabled={form.processing}>
                            {form.processing ? <Spinner /> : null}
                            {t('core.actions.save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function AdminVehicleVariants(props: Props) {
    const { makes, models, variants, batteries, filters, canManage } = props;
    const [variantDialog, setVariantDialog] = useState<{
        variant: Variant | null;
    } | null>(null);
    const [batteryDialog, setBatteryDialog] = useState<{
        battery: BatteryRow | null;
    } | null>(null);

    const navigate = (query: Record<string, string>) =>
        router.get(
            index({ query }).url,
            {},
            { preserveScroll: true, preserveState: true, replace: true },
        );

    return (
        <>
            <Head title={t('vehicles.admin.variants.title')} />
            <div className="space-y-6">
                <PageHeader
                    title={t('vehicles.admin.title')}
                    description={t('vehicles.admin.description')}
                    actions={
                        canManage ? (
                            <Button
                                type="button"
                                onClick={() =>
                                    setVariantDialog({ variant: null })
                                }
                                disabled={models.length === 0}
                            >
                                <Plus className="size-4" aria-hidden="true" />
                                {t('vehicles.admin.variants.add')}
                            </Button>
                        ) : null
                    }
                />
                <VehiclesAdminNav current="variants" />
                <DomainErrorAlert />
                <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
                    <OptionSelect
                        aria-label={t('vehicles.fields.make')}
                        value={filters.make ? String(filters.make) : ALL}
                        options={[
                            {
                                value: ALL,
                                label: t('vehicles.admin.models.all_makes'),
                            },
                            ...makes.map((make) => ({
                                value: String(make.id),
                                label: make.name,
                            })),
                        ]}
                        onChange={(value) =>
                            navigate(value === ALL ? {} : { make: value })
                        }
                    />
                    <OptionSelect
                        aria-label={t('vehicles.fields.model')}
                        value={filters.model ? String(filters.model) : ALL}
                        disabled={!filters.make}
                        options={[
                            {
                                value: ALL,
                                label: t('vehicles.admin.variants.all_models'),
                            },
                            ...models.map((model) => ({
                                value: String(model.id),
                                label: model.name,
                            })),
                        ]}
                        onChange={(value) =>
                            navigate(
                                value === ALL
                                    ? { make: String(filters.make ?? '') }
                                    : {
                                          make: String(filters.make ?? ''),
                                          model: value,
                                      },
                            )
                        }
                    />
                </div>
                {!filters.make && !filters.model && variants.length >= 300 ? (
                    <p className="text-sm text-muted-foreground">
                        {t('vehicles.admin.variants.limited')}
                    </p>
                ) : null}
                {variants.length === 0 ? (
                    <EmptyState
                        icon={Rows3}
                        title={t('vehicles.admin.variants.title')}
                        description={t('vehicles.admin.variants.empty')}
                    />
                ) : (
                    <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>
                                        {t('vehicles.admin.variants.title')}
                                    </TableHead>
                                    <TableHead>
                                        {t('vehicles.fields.market_version')}
                                    </TableHead>
                                    <TableHead>
                                        {t('vehicles.admin.variants.years')}
                                    </TableHead>
                                    <TableHead className="hidden lg:table-cell">
                                        {t(
                                            'vehicles.admin.variants.connectors',
                                        )}
                                    </TableHead>
                                    <TableHead className="hidden text-end md:table-cell">
                                        {t(
                                            'vehicles.fields.battery_capacity_kwh',
                                        )}
                                    </TableHead>
                                    <TableHead className="hidden text-end sm:table-cell">
                                        {t(
                                            'vehicles.admin.makes.vehicles_count',
                                        )}
                                    </TableHead>
                                    <TableHead>
                                        {t('vehicles.fields.is_active')}
                                    </TableHead>
                                    {canManage ? (
                                        <TableHead className="text-end">
                                            {t('core.labels.actions')}
                                        </TableHead>
                                    ) : null}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {variants.map((variant) => (
                                    <TableRow key={variant.id}>
                                        <TableCell className="min-w-48">
                                            <p className="font-medium">
                                                {variant.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {variant.make_name}{' '}
                                                {variant.model_name}
                                                {variant.trim
                                                    ? ` · ${variant.trim}`
                                                    : ''}
                                            </p>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">
                                                {variant.market_version_label}
                                            </Badge>
                                        </TableCell>
                                        <TableCell
                                            className="tabular whitespace-nowrap"
                                            dir="ltr"
                                        >
                                            {yearRange(
                                                variant.year_from,
                                                variant.year_to,
                                            )}
                                        </TableCell>
                                        <TableCell className="hidden text-sm lg:table-cell">
                                            {[
                                                variant.ac_connector,
                                                variant.dc_connector,
                                            ]
                                                .filter(Boolean)
                                                .join(' · ') || '—'}
                                        </TableCell>
                                        <TableCell className="tabular hidden text-end md:table-cell">
                                            {variant.battery_capacity_kwh
                                                ? formatNumber(
                                                      variant.battery_capacity_kwh,
                                                      2,
                                                  )
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="tabular hidden text-end sm:table-cell">
                                            {formatNumber(
                                                variant.vehicles_count,
                                                0,
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {canManage ? (
                                                <ActiveToggle
                                                    url={toggle(variant.id).url}
                                                    active={variant.is_active}
                                                    label={`${t('vehicles.fields.is_active')}: ${variant.name}`}
                                                />
                                            ) : (
                                                <span className="text-sm">
                                                    {variant.is_active
                                                        ? t('core.labels.yes')
                                                        : t('core.labels.no')}
                                                </span>
                                            )}
                                        </TableCell>
                                        {canManage ? (
                                            <TableCell className="text-end whitespace-nowrap">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={`${t('core.actions.edit')}: ${variant.name}`}
                                                    onClick={() =>
                                                        setVariantDialog({
                                                            variant,
                                                        })
                                                    }
                                                >
                                                    <Pencil
                                                        className="size-4"
                                                        aria-hidden="true"
                                                    />
                                                </Button>
                                                <DeleteRowButton
                                                    url={
                                                        destroy(variant.id).url
                                                    }
                                                    name={variant.name}
                                                    disabled={
                                                        variant.vehicles_count >
                                                        0
                                                    }
                                                    disabledReason={t(
                                                        'vehicles.errors.in_use',
                                                    )}
                                                />
                                            </TableCell>
                                        ) : null}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                <SectionCard
                    title={t('vehicles.admin.batteries.title')}
                    description={t('vehicles.admin.batteries.description')}
                    actions={
                        canManage ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    setBatteryDialog({ battery: null })
                                }
                            >
                                <Plus className="size-4" aria-hidden="true" />
                                {t('vehicles.admin.batteries.add')}
                            </Button>
                        ) : null
                    }
                    flush={batteries.length > 0}
                >
                    {batteries.length === 0 ? (
                        <EmptyState
                            icon={Battery}
                            title={t('vehicles.admin.batteries.title')}
                            description={t('vehicles.admin.batteries.empty')}
                            className="border-0"
                        />
                    ) : (
                        <div className="max-h-96 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>
                                            {t('core.labels.name')}
                                        </TableHead>
                                        <TableHead className="text-end">
                                            {t('vehicles.fields.capacity_kwh')}
                                        </TableHead>
                                        <TableHead>
                                            {t('vehicles.fields.chemistry')}
                                        </TableHead>
                                        {canManage ? (
                                            <TableHead className="text-end">
                                                {t('core.labels.actions')}
                                            </TableHead>
                                        ) : null}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {batteries.map((battery) => (
                                        <TableRow key={battery.id}>
                                            <TableCell
                                                dir="ltr"
                                                className="text-start"
                                            >
                                                {battery.name}
                                            </TableCell>
                                            <TableCell className="tabular text-end">
                                                {formatNumber(
                                                    battery.capacity_kwh,
                                                    2,
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {battery.chemistry ?? '—'}
                                            </TableCell>
                                            {canManage ? (
                                                <TableCell className="text-end whitespace-nowrap">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label={`${t('core.actions.edit')}: ${battery.name}`}
                                                        onClick={() =>
                                                            setBatteryDialog({
                                                                battery,
                                                            })
                                                        }
                                                    >
                                                        <Pencil
                                                            className="size-4"
                                                            aria-hidden="true"
                                                        />
                                                    </Button>
                                                    <DeleteRowButton
                                                        url={
                                                            destroyBattery(
                                                                battery.id,
                                                            ).url
                                                        }
                                                        name={battery.name}
                                                    />
                                                </TableCell>
                                            ) : null}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </SectionCard>
            </div>
            {canManage && variantDialog ? (
                <VariantDialog
                    key={variantDialog.variant?.id ?? 'new'}
                    variant={variantDialog.variant}
                    props={props}
                    onClose={() => setVariantDialog(null)}
                />
            ) : null}
            {canManage && batteryDialog ? (
                <BatteryDialog
                    key={batteryDialog.battery?.id ?? 'new'}
                    battery={batteryDialog.battery}
                    chemistries={props.chemistries}
                    onClose={() => setBatteryDialog(null)}
                />
            ) : null}
        </>
    );
}

AdminVehicleVariants.layout = () => ({
    breadcrumbs: [
        { title: t('vehicles.admin.title'), href: makesIndex().url },
        { title: t('vehicles.admin.variants.title'), href: index().url },
    ],
});
