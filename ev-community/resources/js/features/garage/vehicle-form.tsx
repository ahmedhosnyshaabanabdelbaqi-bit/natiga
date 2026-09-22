import type { InertiaFormProps } from '@inertiajs/react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Code } from '@/components/ui/code';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { findMake, findModel, findVariant } from '@/features/vehicles/catalog';
import { OptionSelect } from '@/features/vehicles/option-select';
import type {
    VehicleCatalog,
    VehicleSelection,
} from '@/features/vehicles/types';
import {
    UNKNOWN_VARIANT,
    VehiclePicker,
} from '@/features/vehicles/vehicle-picker';
import { formatFileSize } from '@/lib/format';
import { t } from '@/lib/i18n';

export type VinAction = 'keep' | 'replace' | 'remove';

export type VehicleFormData = {
    vehicle_make_id: number | null;
    vehicle_model_id: number | null;
    vehicle_variant_id: number | null;
    year: number | null;
    market_version: string;
    battery_variant_id: string;
    odometer_km: string;
    vin: string;
    vin_action: VinAction;
    nickname: string;
    color: string;
    plate_hint: string;
    image: File | null;
    remove_image: boolean;
};

export type VehicleForm = InertiaFormProps<VehicleFormData>;

export const STEP_FIELDS: Record<
    'vehicle' | 'details' | 'identity' | 'photo',
    (keyof VehicleFormData)[]
> = {
    vehicle: [
        'vehicle_make_id',
        'vehicle_model_id',
        'vehicle_variant_id',
        'year',
    ],
    details: ['market_version', 'battery_variant_id', 'odometer_km'],
    identity: ['vin', 'nickname', 'color', 'plate_hint'],
    photo: ['image', 'remove_image'],
};

export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export function normalizeVin(value: string): string {
    return value.replace(/[\s-]+/g, '').toUpperCase();
}

/** Server payload: the VIN is only sent when the member explicitly replaces or removes it. */
export function toPayload(data: VehicleFormData): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        vehicle_make_id: data.vehicle_make_id,
        vehicle_model_id: data.vehicle_model_id,
        vehicle_variant_id: data.vehicle_variant_id ?? '',
        year: data.year,
        market_version: data.market_version,
        battery_variant_id:
            data.battery_variant_id === UNKNOWN_VARIANT
                ? ''
                : data.battery_variant_id,
        nickname: data.nickname,
        color: data.color,
        plate_hint: data.plate_hint,
    };
    if (data.odometer_km !== '') {
        payload.odometer_km = data.odometer_km;
    }
    if (data.vin_action === 'replace') {
        payload.vin = normalizeVin(data.vin);
    } else if (data.vin_action === 'remove') {
        payload.vin = '';
    }
    if (data.image) {
        payload.image = data.image;
    }
    if (data.remove_image) {
        payload.remove_image = 1;
    }
    return payload;
}

/** Step 1 — make → model → variant ("I don't know") → year. Choosing a variant pre-fills market & battery. */
export function VehicleFields({
    form,
    catalog,
}: {
    form: VehicleForm;
    catalog: VehicleCatalog;
}) {
    const value: VehicleSelection = {
        make_id: form.data.vehicle_make_id,
        model_id: form.data.vehicle_model_id,
        variant_id: form.data.vehicle_variant_id,
        year: form.data.year,
    };
    return (
        <div className="space-y-4">
            <VehiclePicker
                catalog={catalog}
                value={value}
                yearRequired
                idPrefix="garage"
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
                        battery_variant_id:
                            variant &&
                            next.variant_id !== current.vehicle_variant_id &&
                            variant.battery_variant_id
                                ? String(variant.battery_variant_id)
                                : current.battery_variant_id,
                    }));
                }}
            />
            <p className="text-xs text-muted-foreground">
                {t('vehicles.hints.variant_unknown')}
            </p>
        </div>
    );
}

/** Step 2 — market version, battery pack and (when adding) the first odometer reading. */
export function DetailsFields({
    form,
    catalog,
    withOdometer,
}: {
    form: VehicleForm;
    catalog: VehicleCatalog;
    withOdometer: boolean;
}) {
    const variant = findVariant(
        findModel(
            findMake(catalog, form.data.vehicle_make_id),
            form.data.vehicle_model_id,
        ),
        form.data.vehicle_variant_id,
    );
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <FormField
                id="garage-market"
                label={t('vehicles.fields.market_version')}
                required
                error={form.errors.market_version}
                hint={t('vehicles.hints.market_version')}
            >
                <OptionSelect
                    value={form.data.market_version}
                    options={catalog.market_versions}
                    onChange={(value) => form.setData('market_version', value)}
                />
            </FormField>
            <FormField
                id="garage-battery"
                label={t('vehicles.fields.battery')}
                optional
                error={form.errors.battery_variant_id}
                hint={
                    variant?.battery_variant_id
                        ? t('vehicles.hints.battery_from_variant')
                        : undefined
                }
            >
                <OptionSelect
                    value={form.data.battery_variant_id || UNKNOWN_VARIANT}
                    onChange={(value) =>
                        form.setData(
                            'battery_variant_id',
                            value === UNKNOWN_VARIANT ? '' : value,
                        )
                    }
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
                />
            </FormField>
            {withOdometer ? (
                <FormField
                    id="garage-odometer"
                    label={t('vehicles.fields.odometer')}
                    optional
                    error={form.errors.odometer_km}
                    hint={t('garage.wizard.odometer_hint')}
                >
                    <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={2000000}
                        step={1}
                        dir="ltr"
                        value={form.data.odometer_km}
                        onChange={(event) =>
                            form.setData('odometer_km', event.target.value)
                        }
                    />
                </FormField>
            ) : null}
        </div>
    );
}

/** Step 3 — VIN (optional, encrypted), nickname, colour, plate hint. */
export function IdentityFields({
    form,
    maskedVin,
    supportUrl,
}: {
    form: VehicleForm;
    maskedVin: string | null;
    supportUrl: string | null;
}) {
    const normalized = normalizeVin(form.data.vin);
    const showVinInput =
        maskedVin === null || form.data.vin_action === 'replace';
    const vinLooksInvalid =
        showVinInput && normalized !== '' && !VIN_PATTERN.test(normalized);
    const duplicate =
        form.errors.vin !== undefined &&
        form.errors.vin === t('vehicles.errors.vin_duplicate');

    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-3 sm:col-span-2">
                {maskedVin !== null ? (
                    <FormField label={t('vehicles.fields.vin')}>
                        {(control) => (
                            <RadioGroup
                                value={form.data.vin_action}
                                onValueChange={(value) =>
                                    form.setData((current) => ({
                                        ...current,
                                        vin_action: value as VinAction,
                                        vin: '',
                                    }))
                                }
                                aria-describedby={control['aria-describedby']}
                                className="gap-2"
                            >
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem
                                        id="vin-keep"
                                        value="keep"
                                    />
                                    <Label
                                        htmlFor="vin-keep"
                                        className="font-normal"
                                    >
                                        {t('garage.edit.vin_keep')}{' '}
                                        <Code>{maskedVin}</Code>
                                    </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem
                                        id="vin-replace"
                                        value="replace"
                                    />
                                    <Label
                                        htmlFor="vin-replace"
                                        className="font-normal"
                                    >
                                        {t('garage.edit.vin_replace')}
                                    </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem
                                        id="vin-remove"
                                        value="remove"
                                    />
                                    <Label
                                        htmlFor="vin-remove"
                                        className="font-normal"
                                    >
                                        {t('garage.edit.vin_remove')}
                                    </Label>
                                </div>
                            </RadioGroup>
                        )}
                    </FormField>
                ) : null}
                {showVinInput ? (
                    <FormField
                        id="garage-vin"
                        label={
                            maskedVin !== null
                                ? t('garage.edit.new_vin')
                                : t('vehicles.fields.vin')
                        }
                        optional={maskedVin === null}
                        required={maskedVin !== null}
                        hint={t('vehicles.hints.vin')}
                        error={
                            form.errors.vin ??
                            (vinLooksInvalid
                                ? t('vehicles.errors.vin_invalid')
                                : undefined)
                        }
                    >
                        <Input
                            dir="ltr"
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={24}
                            className="font-mono uppercase"
                            value={form.data.vin}
                            onChange={(event) =>
                                form.setData((current) => ({
                                    ...current,
                                    vin: event.target.value,
                                    vin_action:
                                        maskedVin === null
                                            ? event.target.value.trim() === ''
                                                ? 'keep'
                                                : 'replace'
                                            : current.vin_action,
                                }))
                            }
                        />
                    </FormField>
                ) : null}
                {duplicate ? (
                    <InlineAlert
                        tone="warning"
                        title={t('vehicles.errors.vin_duplicate')}
                    >
                        {t('vehicles.hints.vin_duplicate_support')}{' '}
                        {supportUrl ? (
                            <a href={supportUrl}>
                                {t('garage.wizard.contact_support')}
                            </a>
                        ) : null}
                    </InlineAlert>
                ) : null}
            </div>
            <FormField
                id="garage-nickname"
                label={t('vehicles.fields.nickname')}
                optional
                error={form.errors.nickname}
            >
                <Input
                    maxLength={60}
                    value={form.data.nickname}
                    onChange={(event) =>
                        form.setData('nickname', event.target.value)
                    }
                />
            </FormField>
            <FormField
                id="garage-color"
                label={t('vehicles.fields.color')}
                optional
                error={form.errors.color}
            >
                <Input
                    maxLength={40}
                    value={form.data.color}
                    onChange={(event) =>
                        form.setData('color', event.target.value)
                    }
                />
            </FormField>
            <FormField
                id="garage-plate"
                label={t('vehicles.fields.plate_hint')}
                optional
                hint={t('vehicles.hints.plate_hint')}
                error={form.errors.plate_hint}
            >
                <Input
                    maxLength={3}
                    dir="ltr"
                    className="w-24 uppercase"
                    value={form.data.plate_hint}
                    onChange={(event) =>
                        form.setData('plate_hint', event.target.value)
                    }
                />
            </FormField>
        </div>
    );
}

/** Step 4 — optional photo (JPEG/PNG/WebP ≤ max MB), stored privately through the Files module. */
export function PhotoFields({
    form,
    maxImageMb,
    currentImage,
}: {
    form: VehicleForm;
    maxImageMb: number;
    currentImage: string | null;
}) {
    const preview = useMemo(
        () => (form.data.image ? URL.createObjectURL(form.data.image) : null),
        [form.data.image],
    );
    useEffect(() => {
        return () => {
            if (preview) {
                URL.revokeObjectURL(preview);
            }
        };
    }, [preview]);

    const tooLarge =
        form.data.image !== null &&
        form.data.image.size > maxImageMb * 1024 * 1024;
    const shown = preview ?? (form.data.remove_image ? null : currentImage);

    return (
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr] sm:items-start">
            <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border bg-muted">
                {shown ? (
                    <img
                        src={shown}
                        alt={t('vehicles.fields.image')}
                        className="size-full object-cover"
                    />
                ) : (
                    <ImagePlus
                        className="size-8 text-muted-foreground"
                        aria-hidden="true"
                    />
                )}
            </div>
            <div className="grid gap-3">
                <FormField
                    id="garage-image"
                    label={t('vehicles.fields.image')}
                    optional
                    hint={t('vehicles.hints.image', { max: maxImageMb })}
                    error={
                        form.errors.image ??
                        (tooLarge
                            ? t('garage.wizard.image_too_large', {
                                  max: maxImageMb,
                              })
                            : undefined)
                    }
                >
                    <Input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) =>
                            form.setData((current) => ({
                                ...current,
                                image: event.target.files?.[0] ?? null,
                                remove_image: false,
                            }))
                        }
                    />
                </FormField>
                {form.data.image ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="truncate">
                            {form.data.image.name} ·{' '}
                            {formatFileSize(form.data.image.size)}
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => form.setData('image', null)}
                        >
                            <Trash2 className="size-4" aria-hidden="true" />
                            {t('core.actions.remove')}
                        </Button>
                    </div>
                ) : null}
                {currentImage && !form.data.image ? (
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="garage-remove-image"
                            checked={form.data.remove_image}
                            onCheckedChange={(checked) =>
                                form.setData('remove_image', checked === true)
                            }
                        />
                        <Label
                            htmlFor="garage-remove-image"
                            className="font-normal"
                        >
                            {t('garage.edit.remove_image')}
                        </Label>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

/** Client-side pre-checks per step (the server validates everything again). */
export function stepIsComplete(
    step: keyof typeof STEP_FIELDS,
    data: VehicleFormData,
    maxImageMb: number,
): boolean {
    switch (step) {
        case 'vehicle':
            return (
                data.vehicle_make_id !== null &&
                data.vehicle_model_id !== null &&
                data.year !== null
            );
        case 'details':
            return data.market_version !== '';
        case 'identity': {
            if (data.vin_action !== 'replace') {
                return true;
            }
            return VIN_PATTERN.test(normalizeVin(data.vin));
        }
        case 'photo':
            return (
                data.image === null ||
                data.image.size <= maxImageMb * 1024 * 1024
            );
    }
}

/** First step holding a server validation error (to jump back to it). */
export function stepWithError(
    errors: Partial<Record<string, string>>,
): keyof typeof STEP_FIELDS | null {
    for (const [step, fields] of Object.entries(STEP_FIELDS) as [
        keyof typeof STEP_FIELDS,
        (keyof VehicleFormData)[],
    ][]) {
        if (fields.some((field) => errors[field] !== undefined)) {
            return step;
        }
    }
    return null;
}
