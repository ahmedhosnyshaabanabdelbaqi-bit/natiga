/**
 * Shapes of the vehicle master data served by `GET /{locale}/vehicles/data`
 * (App\Modules\Vehicles\Services\VehicleDataService) and of the shared `selectedVehicle` prop.
 */

export type MarketVersion = 'china' | 'europe' | 'gulf' | 'egypt' | 'other' | 'unknown';

export type Option<T extends string = string> = { value: T; label: string };

export type CatalogVariant = {
    id: number;
    name: string;
    trim: string | null;
    market_version: MarketVersion;
    year_from: number;
    year_to: number | null;
    battery_variant_id: number | null;
    battery_capacity_kwh: string | null;
    ac_connector_type_id: number | null;
    dc_connector_type_id: number | null;
    is_active?: boolean;
};

export type CatalogModel = {
    id: number;
    slug: string;
    name: string;
    body_type: string | null;
    is_active?: boolean;
    variants: CatalogVariant[];
};

export type CatalogMake = {
    id: number;
    slug: string;
    name: string;
    logo: string | null;
    is_active?: boolean;
    models: CatalogModel[];
};

export type ConnectorTypeOption = { id: number; code: string; name: string; current_type: 'ac' | 'dc' };

export type BatteryOption = { id: number; name: string; capacity_kwh: string; chemistry: string | null };

export type VehicleCatalog = {
    generated_at: string;
    years: { min: number; max: number };
    market_versions: Option<MarketVersion>[];
    connector_types: ConnectorTypeOption[];
    battery_variants: BatteryOption[];
    makes: CatalogMake[];
};

/** Shared Inertia prop `selectedVehicle` (App\Modules\Vehicles\Services\SelectedVehicle::current()). */
export type SelectedVehicle = {
    source: 'garage' | 'session';
    vehicle_id: string | null;
    make_id: number;
    model_id: number;
    variant_id: number | null;
    year: number | null;
    make_name: string;
    model_name: string;
    variant_name: string | null;
    display_name: string;
};

/** A make → model → (variant) → (year) selection, as posted to the server. */
export type VehicleSelection = {
    make_id: number | null;
    model_id: number | null;
    variant_id: number | null;
    year: number | null;
};

export type ConnectorSummary = { id: number; code: string; name: string; current_type: 'ac' | 'dc' };
