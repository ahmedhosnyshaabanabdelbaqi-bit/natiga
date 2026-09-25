/**
 * Types of the explainable recommendation engine (REQUIREMENTS §7: reasons,
 * weights and missing data are always explained; no decisive verdict when
 * the data is not comparable; paid placements never influence the ranking).
 */
import type { CarFacts, Lang } from '../../comparisons/engine/types';

export type { Lang };

export const FACTORS = [
  'price',
  'range',
  'dcCharging',
  'acCharging',
  'efficiency',
  'space',
  'performance',
] as const;
export type Factor = (typeof FACTORS)[number];

export interface RecoInput {
  /** Maximum price in the market currency. */
  budget: number;
  currency: string;
  dailyKm: number;
  longTripsPerMonth: number;
  homeCharging: boolean;
  seatsNeeded: number;
  bodyTypes: string[] | null;
  powertrains: string[];
  /** Relative user weights (0–10) per factor; unspecified factors keep their defaults. */
  weights?: Partial<Record<Factor, number>>;
  limit: number;
}

export interface Candidate {
  facts: CarFacts;
  bodyType: string | null;
}

export type WeightSource = 'default' | 'usage' | 'user';

export interface FactorWeight {
  factor: Factor;
  label: string;
  /** Normalized weight (all weights sum to 1). */
  weight: number;
  /** Weight before normalization. */
  raw: number;
  source: WeightSource;
  betterDirection: 'higher' | 'lower';
  description: string;
}

export interface FactorValue {
  status: 'present' | 'missing' | 'cycle_mismatch' | 'mode_mismatch';
  value: number | null;
  unit: string | null;
  /** Basis of the value (e.g. cycle "WLTP", mode "combined", "peak"). */
  basis: string | null;
  /** Known absence (e.g. no DC inlet) — a real 0, never a missing value. */
  knownAbsent?: boolean;
}

export interface Contribution {
  factor: Factor;
  label: string;
  weight: number;
  /** 0..1 position among the ranked cars (1 = best). */
  score: number;
  /** weight × score × 100 (the total score is the sum). */
  points: number;
  value: number | null;
  unit: string | null;
  basis: string | null;
}

export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface Reason {
  factor: Factor | 'fit';
  code: string;
  sentiment: Sentiment;
  text: string;
  params: Record<string, string | number | boolean | null>;
}

export interface MissingItem {
  factor: Factor | 'price' | 'seats';
  label: string;
  reason: 'missing' | 'cycle_mismatch' | 'mode_mismatch';
  detail: string;
}

export interface RankedCar {
  rank: number;
  key: string;
  score: number;
  contributions: Contribution[];
  reasons: Reason[];
  sponsored: false;
}

export type NotRankedReason =
  'missing_data' | 'not_comparable' | 'price_not_available' | 'seats_not_available';

export interface NotRankedCar {
  key: string;
  reason: NotRankedReason;
  missingData: MissingItem[];
  explanation: string;
}

export interface FactorAvailability {
  factor: Factor;
  label: string;
  available: number;
  missing: number;
  notComparable: number;
  suggestion: string | null;
}

export type NoDecisionReason =
  'no_candidates' | 'no_comparable_candidates' | 'fewer_than_two_comparable' | 'scores_too_close';

export interface Decision {
  decisive: boolean;
  reason: NoDecisionReason | null;
  message: string;
  topPickKey: string | null;
}

export interface RecoResult {
  weights: FactorWeight[];
  weightNotes: string[];
  basis: {
    rangeCycle: string | null;
    consumptionCycle: string | null;
    consumptionMode: string | null;
    currency: string;
  };
  decision: Decision;
  ranked: RankedCar[];
  notRanked: NotRankedCar[];
  excluded: {
    total: number;
    overBudget: number;
    seatsTooFew: number;
    bodyType: number;
    powertrain: number;
  };
  factorAvailability: FactorAvailability[];
  candidatesConsidered: number;
  notes: string[];
}
