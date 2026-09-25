/**
 * Types of the pure comparison engine (REQUIREMENTS §7). The engine works on
 * `CarFacts` (one trim of one model year in one market, values already in
 * canonical units with their provenance) and never reads the database, ads or
 * sponsorship data — so nothing but catalog data can change a result.
 */
import type {
  ChargingTimeDto,
  ConsumptionDto,
  DataPointDto,
  InletDto,
  PriceDto,
  RangeDto,
  SourceSummaryDto,
} from '../../vehicles/dto/shared.dto';

export type Lang = 'ar' | 'en';

/** Metric groups in display order (§7 list). */
export const METRIC_GROUPS = [
  'price',
  'range',
  'battery',
  'consumption',
  'charging',
  'performance',
  'space',
  'safety',
  'warranty',
  'features',
] as const;
export type MetricGroupKey = (typeof METRIC_GROUPS)[number];

/**
 * Why a row can (not) decide a winner.
 * - comparable: every value present and measured on the same basis;
 * - not_comparable_cycles: ranges / consumption from different test cycles
 *   (never converted);
 * - not_comparable_soc_window: charging times for different SoC windows
 *   (10–80 % ≠ 30–80 %);
 * - not_comparable_conditions: same cycle / window but different measuring
 *   conditions (operating mode, a charger that limited the car);
 * - missing_data: at least one value is not available (never treated as 0);
 * - different_currency: prices in different currencies (never converted);
 * - not_applicable: the metric does not apply to at least one powertrain
 *   (e.g. total range of a BEV, fuel consumption of a BEV).
 */
export const COMPARABILITY = [
  'comparable',
  'not_comparable_cycles',
  'not_comparable_soc_window',
  'not_comparable_conditions',
  'missing_data',
  'different_currency',
  'not_applicable',
] as const;
export type Comparability = (typeof COMPARABILITY)[number];

export type Direction = 'higher' | 'lower' | 'none';
export const OUTCOMES = ['winner', 'tie', 'no_winner'] as const;
export type Outcome = (typeof OUTCOMES)[number];
export type ValueStatus = 'present' | 'missing' | 'not_applicable';
export type MetricKind = 'number' | 'text' | 'boolean' | 'money';

/** Measuring basis of a value (only the relevant keys are set). */
export interface MetricCondition {
  cycle?: string | null;
  cycleNote?: string | null;
  rangeType?: string | null;
  mode?: string | null;
  currentType?: string | null;
  fromSoc?: number | null;
  toSoc?: number | null;
  socWindow?: string | null;
  chargerPowerKw?: number | null;
  wheelSizeInch?: number | null;
  conditions?: string | null;
  priceType?: string | null;
  priceTypeLabel?: string | null;
  currency?: string | null;
  effectiveFrom?: string | null;
  inMarketCurrency?: boolean | null;
}

/** Another value of the same car for this row (other cycle, window, wheel size…). */
export interface AlternativeValue {
  value: number | string | boolean;
  unit: string | null;
  originalValue: string | null;
  originalUnit: string | null;
  condition: MetricCondition | null;
  reliability: string | null;
}

export interface MetricValue {
  carKey: string;
  status: ValueStatus;
  /** Canonical value (number in `unit`, text, boolean, or a decimal money string). null unless present. */
  value: number | string | boolean | null;
  /** Localized label of a coded value (drive type, inlets); null otherwise. */
  valueLabel: string | null;
  unit: string | null;
  originalValue: string | null;
  originalUnit: string | null;
  condition: MetricCondition | null;
  reliability: string | null;
  verifiedAt: string | null;
  source: SourceSummaryDto | null;
  derived: boolean;
  /** Localized per-value note (e.g. "highest of 2 values in this cycle"). */
  note: string | null;
  alternatives: AlternativeValue[];
}

export interface Metric {
  key: string;
  group: MetricGroupKey;
  label: string;
  description: string | null;
  kind: MetricKind;
  unit: string | null;
  betterDirection: Direction;
  comparability: Comparability;
  /** Localized explanation of the comparability / outcome (null when plainly comparable). */
  comparabilityNote: string | null;
  /** Common basis used for the comparison (cycle, SoC window, currency…), null when none. */
  basis: MetricCondition | null;
  outcome: Outcome;
  /** Car keys of the best value(s); empty unless outcome = winner. */
  winners: string[];
  /** True when the cars do not all show the same value (for "differences only"). */
  isDifferent: boolean;
  /** Shown in the summary view. */
  isKey: boolean;
  values: MetricValue[];
}

export interface MetricGroup {
  key: MetricGroupKey;
  label: string;
  metrics: Metric[];
}

/** Canonical facts of one car (trim × model year × market). */
export interface CarFacts {
  /** "variantId@MARKET" */
  key: string;
  powertrainType: string;
  seats: number | null;
  doors: number | null;
  driveType: string | null;
  /** Currency of the car's market. */
  marketCurrency: string;
  price: PriceDto | null;
  ranges: RangeDto[];
  consumption: ConsumptionDto[];
  chargingTimes: ChargingTimeDto[];
  /** Charging inlets recorded for the market (empty = unknown). */
  inlets: InletDto[];
  /** Spec values by key (market row first, then global). */
  specs: Map<string, DataPointDto>;
}

/** Spec definition as needed by the engine. */
export interface SpecDefLite {
  key: string;
  group: string;
  dataType: string;
  unit: string | null;
  betterDirection: string;
  labelAr: string;
  labelEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  isKeySpec: boolean;
  isComparable: boolean;
  sortOrder: number;
}

export interface CompareOptions {
  lang: Lang;
  view: 'summary' | 'detailed';
  differencesOnly: boolean;
}

export interface ComparisonSummary {
  metricsTotal: number;
  comparableMetrics: number;
  decidedMetrics: number;
  notComparableMetrics: number;
  missingDataMetrics: number;
  notApplicableMetrics: number;
  /** Rows won per car (ties and undecided rows not counted). NOT a weighted verdict. */
  winsByCar: { carKey: string; wins: number }[];
  note: string;
}

export interface EngineResult {
  groups: MetricGroup[];
  summary: ComparisonSummary;
}
