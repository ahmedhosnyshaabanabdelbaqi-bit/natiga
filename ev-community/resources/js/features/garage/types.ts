import type {
    ConnectorSummary,
    MarketVersion,
} from '@/features/vehicles/types';

export type LabeledValue<T extends string = string> = {
    value: T;
    label: string;
};

export type VehicleStatusValue = 'active' | 'sold' | 'archived';

/** MemberVehiclePresenter::card() */
export type GarageVehicleCard = {
    id: string;
    display_name: string;
    nickname: string | null;
    make: { id: number; name: string; logo: string | null; slug: string };
    model: { id: number; name: string; body_type: string | null };
    variant: { id: number; name: string; trim: string | null } | null;
    year: number;
    market_version: LabeledValue<MarketVersion>;
    status: LabeledValue<VehicleStatusValue> & { color: string };
    is_primary: boolean;
    odometer_km: number | null;
    odometer_updated_at: string | null;
    image_url: string | null;
    color: string | null;
    has_vin: boolean;
    created_at: string | null;
};

/** MemberVehiclePresenter::detail() */
export type GarageVehicleDetail = GarageVehicleCard & {
    plate_hint: string | null;
    vin_masked: string | null;
    battery_capacity_kwh: string | null;
    can_delete: boolean;
    delete_blocked_reason: string | null;
};

/** GarageSections::tabsFor() */
export type GarageSectionTab = {
    key: string;
    label: string;
    module: string | null;
    order: number;
};

/** Props every section component (`resources/js/features/garage/sections/<key>.tsx`) receives. */
export type GarageSectionProps<TData = Record<string, unknown>> = {
    /** Resolver output for this vehicle (never null here: null data renders the generic empty state). */
    data: TData;
    vehicle: GarageVehicleDetail;
    canUpdate: boolean;
};

/** "info" section — MemberVehiclePresenter::info() */
export type InfoSectionData = {
    make: string;
    model: string;
    model_code: string | null;
    body_type: string | null;
    variant: string | null;
    trim: string | null;
    year: number;
    market_version: string;
    battery: {
        name: string;
        capacity_kwh: string;
        chemistry: string | null;
    } | null;
    battery_capacity_kwh: string | null;
    motor_kw: number | null;
    range_km_wltp: number | null;
    connectors: { ac: ConnectorSummary | null; dc: ConnectorSummary | null };
    spec_notes: string | null;
    color: string | null;
    plate_hint: string | null;
    nickname: string | null;
    has_vin: boolean;
    vin_masked: string | null;
};

export type OdometerEntry = {
    id: number;
    odometer_km: number;
    source: LabeledValue;
    recorded_at: string;
    note: string | null;
    created_by: string | null;
    is_decrease: boolean;
};

/** "odometer" section — MemberVehiclePresenter::odometer() */
export type OdometerSectionData = {
    current_km: number | null;
    updated_at: string | null;
    history: OdometerEntry[];
};

export type CompatibleConnector = ConnectorSummary & {
    adapter_name: string | null;
    notes: string | null;
};

/** "charging_compatibility" section — MemberVehiclePresenter::chargingCompatibility() */
export type ChargingSectionData = {
    known: boolean;
    vehicle_connectors: ConnectorSummary[];
    direct: CompatibleConnector[];
    adapter: CompatibleConnector[];
    incompatible: CompatibleConnector[];
};
