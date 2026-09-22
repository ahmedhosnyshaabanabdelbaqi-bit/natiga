import { FormField } from '@/components/shared/form-field';
import { findMake, findModel, findVariant, variantLabel, yearOptions } from '@/features/vehicles/catalog';
import { OptionSelect } from '@/features/vehicles/option-select';
import type { VehicleCatalog, VehicleSelection } from '@/features/vehicles/types';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export const UNKNOWN_VARIANT = 'none';

type Errors = Partial<Record<'make' | 'model' | 'variant' | 'year', string | undefined>>;

type Props = {
    catalog: VehicleCatalog;
    value: VehicleSelection;
    onChange: (value: VehicleSelection) => void;
    errors?: Errors;
    /** Show the variant step (with an "I don't know" choice). */
    withVariant?: boolean;
    withYear?: boolean;
    /** Year is mandatory (garage) or optional (store selector). */
    yearRequired?: boolean;
    disabled?: boolean;
    className?: string;
    idPrefix?: string;
};

/**
 * Make → model → variant ("I don't know" allowed) → year cascade over the vehicle catalog.
 * Changing a parent clears its children; the year list follows the chosen variant's production years.
 */
export function VehiclePicker({ catalog, value, onChange, errors = {}, withVariant = true, withYear = true, yearRequired = false, disabled = false, className, idPrefix = 'vehicle' }: Props) {
    const make = findMake(catalog, value.make_id);
    const model = findModel(make, value.model_id);
    const variant = findVariant(model, value.variant_id);
    const years = yearOptions(catalog, variant);

    return (
        <div className={cn('grid gap-4 sm:grid-cols-2', className)}>
            <FormField id={`${idPrefix}-make`} label={t('vehicles.selector.make')} required error={errors.make}>
                <OptionSelect
                    value={value.make_id ? String(value.make_id) : ''}
                    placeholder={t('vehicles.selector.choose_make')}
                    disabled={disabled}
                    options={catalog.makes.map((item) => ({ value: String(item.id), label: item.name }))}
                    onChange={(next) => onChange({ make_id: Number(next), model_id: null, variant_id: null, year: value.year })}
                />
            </FormField>
            <FormField id={`${idPrefix}-model`} label={t('vehicles.selector.model')} required error={errors.model}>
                <OptionSelect
                    value={value.model_id ? String(value.model_id) : ''}
                    placeholder={make ? t('vehicles.selector.choose_model') : t('vehicles.selector.choose_make_first')}
                    disabled={disabled || !make}
                    options={(make?.models ?? []).map((item) => ({ value: String(item.id), label: item.name }))}
                    onChange={(next) => onChange({ ...value, model_id: Number(next), variant_id: null })}
                />
            </FormField>
            {withVariant ? (
                <FormField id={`${idPrefix}-variant`} label={t('vehicles.selector.variant')} optional error={errors.variant} hint={model && model.variants.length === 0 ? t('vehicles.selector.no_variants') : undefined}>
                    <OptionSelect
                        value={value.variant_id ? String(value.variant_id) : value.model_id ? UNKNOWN_VARIANT : ''}
                        placeholder={t('vehicles.selector.choose_variant')}
                        disabled={disabled || !model}
                        options={[
                            { value: UNKNOWN_VARIANT, label: t('vehicles.selector.unknown_variant') },
                            ...(model?.variants ?? []).map((item) => ({ value: String(item.id), label: variantLabel(item) })),
                        ]}
                        onChange={(next) => {
                            const chosen = next === UNKNOWN_VARIANT ? undefined : findVariant(model, Number(next));
                            const keepYear = value.year !== null && (!chosen || yearOptions(catalog, chosen).includes(value.year));
                            onChange({ ...value, variant_id: chosen ? chosen.id : null, year: keepYear ? value.year : null });
                        }}
                    />
                </FormField>
            ) : null}
            {withYear ? (
                <FormField id={`${idPrefix}-year`} label={t('vehicles.selector.year')} required={yearRequired} optional={!yearRequired} error={errors.year}>
                    <OptionSelect
                        value={value.year ? String(value.year) : ''}
                        placeholder={t('vehicles.selector.choose_year')}
                        disabled={disabled || !model}
                        options={years.map((year) => ({ value: String(year), label: String(year) }))}
                        onChange={(next) => onChange({ ...value, year: Number(next) })}
                    />
                </FormField>
            ) : null}
        </div>
    );
}
