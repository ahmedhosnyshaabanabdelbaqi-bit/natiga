import type {
    CatalogMake,
    CatalogModel,
    CatalogVariant,
    VehicleCatalog,
} from '@/features/vehicles/types';
import { t } from '@/lib/i18n';

export function findMake(
    catalog: VehicleCatalog | null | undefined,
    id: number | null | undefined,
): CatalogMake | undefined {
    return id ? catalog?.makes.find((make) => make.id === id) : undefined;
}

export function findModel(
    make: CatalogMake | undefined,
    id: number | null | undefined,
): CatalogModel | undefined {
    return id ? make?.models.find((model) => model.id === id) : undefined;
}

export function findVariant(
    model: CatalogModel | undefined,
    id: number | null | undefined,
): CatalogVariant | undefined {
    return id
        ? model?.variants.find((variant) => variant.id === id)
        : undefined;
}

/** "2022–2024", "2022+" or "2022". */
export function yearRange(
    from: number | null | undefined,
    to: number | null | undefined,
): string {
    if (!from) {
        return '';
    }
    if (to === null || to === undefined) {
        return `${from}+`;
    }
    return from === to ? String(from) : `${from}–${to}`;
}

export function marketLabel(value: string | null | undefined): string {
    return value
        ? t(`vehicles.market_version.${value}`)
        : t('vehicles.market_version.unknown');
}

/** Label shown in variant pickers: name · market · years. */
export function variantLabel(variant: CatalogVariant): string {
    return [
        variant.name,
        marketLabel(variant.market_version),
        yearRange(variant.year_from, variant.year_to),
    ]
        .filter(Boolean)
        .join(' · ');
}

/** Selectable model years (newest first), narrowed to the variant production years when one is chosen. */
export function yearOptions(
    catalog: VehicleCatalog | null | undefined,
    variant?: CatalogVariant,
): number[] {
    const max = catalog?.years.max ?? new Date().getFullYear() + 1;
    const min = catalog?.years.min ?? 2008;
    const from = variant ? Math.max(min, variant.year_from) : min;
    const to = variant?.year_to ? Math.min(max, variant.year_to) : max;
    const years: number[] = [];
    for (let year = to; year >= from; year -= 1) {
        years.push(year);
    }
    return years;
}

type CurrentSelection = {
    make: { id: number; name: string };
    model: { id: number; name: string };
    variant: CatalogVariant | null;
};

/**
 * The public catalog only lists ACTIVE master data. When editing an existing vehicle whose make, model
 * or variant was deactivated since, inject the current values so the form can still display them.
 */
export function withCurrentSelection(
    catalog: VehicleCatalog,
    current: CurrentSelection,
): VehicleCatalog {
    let makes = catalog.makes;
    let make = makes.find((item) => item.id === current.make.id);
    if (!make) {
        make = {
            id: current.make.id,
            slug: '',
            name: current.make.name,
            logo: null,
            is_active: false,
            models: [],
        };
        makes = [...makes, make];
    }
    let model = make.models.find((item) => item.id === current.model.id);
    if (!model) {
        model = {
            id: current.model.id,
            slug: '',
            name: current.model.name,
            body_type: null,
            is_active: false,
            variants: [],
        };
    }
    if (
        current.variant &&
        !model.variants.some((item) => item.id === current.variant?.id)
    ) {
        model = {
            ...model,
            variants: [
                ...model.variants,
                { ...current.variant, is_active: false },
            ],
        };
    }
    const finalModel = model;
    const models = make.models.some((item) => item.id === finalModel.id)
        ? make.models.map((item) =>
              item.id === finalModel.id ? finalModel : item,
          )
        : [...make.models, finalModel];
    const finalMake: CatalogMake = { ...make, models };
    return {
        ...catalog,
        makes: makes.map((item) =>
            item.id === finalMake.id ? finalMake : item,
        ),
    };
}
