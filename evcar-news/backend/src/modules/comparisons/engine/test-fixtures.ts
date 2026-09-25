/**
 * Synthetic fixtures for the engine unit tests. Values are made up for the
 * tests only — they describe no real car.
 */
import type {
  ChargingTimeDto,
  ConsumptionDto,
  DataPointDto,
  InletDto,
  PriceDto,
  RangeDto,
} from '../../vehicles/dto/shared.dto';
import type { CarFacts, SpecDefLite } from './types';

let seq = 0;
const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const meta = (reliability = 'manufacturer_claim') => ({
  reliability,
  verifiedAt: null,
  source: null,
});

export function point(
  value: number | string | boolean,
  unit: string | null = null,
  extra: Partial<DataPointDto> = {},
): DataPointDto {
  return {
    value,
    unit,
    originalValue: null,
    originalUnit: null,
    marketCode: null,
    derived: false,
    ...meta(),
    ...extra,
  };
}

export function range(
  cycle: string,
  valueKm: number,
  rangeType: 'electric' | 'total' = 'electric',
  extra: Partial<RangeDto> = {},
): RangeDto {
  return {
    id: id(),
    cycle,
    cycleNote: null,
    rangeType,
    valueKm,
    originalValue: null,
    originalUnit: null,
    wheelSizeInch: null,
    conditions: null,
    marketCode: null,
    ...meta(),
    ...extra,
  };
}

export function consumption(
  cycle: string,
  value: number,
  kind: 'electricity' | 'fuel' = 'electricity',
  mode: string | null = 'combined',
  extra: Partial<ConsumptionDto> = {},
): ConsumptionDto {
  return {
    id: id(),
    cycle,
    cycleNote: null,
    kind,
    mode,
    value,
    unit: kind === 'fuel' ? 'L/100km' : 'Wh/km',
    originalValue: null,
    originalUnit: null,
    conditions: null,
    marketCode: null,
    ...meta(),
    ...extra,
  };
}

export function time(
  currentType: 'AC' | 'DC',
  fromSoc: number,
  toSoc: number,
  durationMinutes: number,
  extra: Partial<ChargingTimeDto> = {},
): ChargingTimeDto {
  return {
    id: id(),
    currentType,
    fromSoc,
    toSoc,
    socWindow: `${fromSoc}–${toSoc}%`,
    durationMinutes,
    chargerPowerKw: null,
    peakPowerKw: null,
    averagePowerKw: null,
    onboardChargerLimitKw: null,
    conditions: null,
    ...meta(),
    ...extra,
  };
}

export function inlet(code: string, currentType: 'AC' | 'DC', maxPowerKw: number | null): InletDto {
  return {
    id: id(),
    connectorType: { code, name: code.toUpperCase() },
    currentType,
    maxPowerKw,
    notes: null,
    ...meta(),
  };
}

export function price(
  amount: string,
  currency = 'EGP',
  priceType = 'official_msrp',
  extra: Partial<PriceDto> = {},
): PriceDto {
  return {
    id: id(),
    marketCode: 'EG',
    amount: { amount, currency },
    priceType,
    priceTypeLabel: priceType,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    isCurrent: true,
    inMarketCurrency: true,
    notes: null,
    ...meta(),
    ...extra,
  };
}

export function car(
  name: string,
  over: Partial<Omit<CarFacts, 'specs'>> & { specs?: Record<string, DataPointDto> } = {},
): CarFacts {
  const { specs, ...rest } = over;
  return {
    key: `${name}@EG`,
    powertrainType: 'BEV',
    seats: 5,
    doors: 5,
    driveType: 'rwd',
    marketCurrency: 'EGP',
    price: null,
    ranges: [],
    consumption: [],
    chargingTimes: [],
    inlets: [],
    ...rest,
    specs: new Map(Object.entries(specs ?? {})),
  };
}

const def = (
  key: string,
  group: string,
  dataType: string,
  unit: string | null,
  betterDirection: string,
  extra: Partial<SpecDefLite> = {},
): SpecDefLite => ({
  key,
  group,
  dataType,
  unit,
  betterDirection,
  labelAr: key,
  labelEn: key,
  descriptionAr: null,
  descriptionEn: null,
  isKeySpec: false,
  isComparable: true,
  sortOrder: 0,
  ...extra,
});

/** A subset of the reference spec definitions (same directions as the seed). */
export const DEFS: SpecDefLite[] = [
  def('battery.gross_kwh', 'battery', 'number', 'kWh', 'none'),
  def('battery.usable_kwh', 'battery', 'number', 'kWh', 'none', { isKeySpec: true }),
  def('battery.chemistry', 'battery', 'text', null, 'none'),
  // Even if an admin set a direction on a battery row, it is ignored (§7).
  def('battery.voltage_v', 'battery', 'number', 'V', 'higher'),
  def('battery.warranty_years', 'battery', 'number', 'year', 'higher'),
  def('charging.ac_max_kw', 'charging', 'number', 'kW', 'higher', { isKeySpec: true }),
  def('charging.dc_peak_kw', 'charging', 'number', 'kW', 'higher', { isKeySpec: true }),
  def('charging.v2l', 'charging', 'boolean', null, 'none'),
  def('performance.power_kw', 'performance', 'number', 'kW', 'higher'),
  def('performance.accel_0_100_s', 'performance', 'number', 's', 'lower', { isKeySpec: true }),
  def('performance.engine_displacement_l', 'performance', 'number', 'l', 'none'),
  def('dimensions.length_mm', 'dimensions', 'number', 'mm', 'none'),
  def('dimensions.curb_weight_kg', 'dimensions', 'number', 'kg', 'lower'),
  def('practicality.trunk_l', 'practicality', 'number', 'l', 'higher'),
  def('safety.airbags', 'safety', 'number', null, 'higher'),
  def('safety.aeb', 'safety', 'boolean', null, 'higher'),
  def('comfort.heat_pump', 'comfort', 'boolean', null, 'none'),
  def('tech.screen_in', 'tech', 'number', 'in', 'none', { isComparable: false }),
  def('warranty.vehicle_years', 'warranty', 'number', 'year', 'higher'),
];
