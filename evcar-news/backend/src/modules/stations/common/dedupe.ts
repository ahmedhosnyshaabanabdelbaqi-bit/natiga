/**
 * Cross-source duplicate heuristics (REQUIREMENTS §10 "منع التكرار"). Two
 * station rows are flagged as a POSSIBLE duplicate (never merged
 * automatically — a reviewer merges) when they are:
 *   - within 50 m of each other, or
 *   - within 150 m AND (names are similar (pg_trgm ≥ 0.4) OR same operator).
 * Distances come from PostGIS (geography, metres) and similarity from
 * pg_trgm on Arabic-normalized names.
 */
export const DEDUPE_SEARCH_RADIUS_M = 150;
export const DEDUPE_NEAR_RADIUS_M = 50;
export const DEDUPE_NAME_SIMILARITY = 0.4;

export interface DedupeEvidence {
  distanceM: number;
  nameSimilarity: number | null;
  sameOperator: boolean;
}

export interface DedupeVerdict {
  candidate: boolean;
  reason: string;
}

export function dedupeVerdict(e: DedupeEvidence): DedupeVerdict {
  const parts = [`${Math.round(e.distanceM)} m`];
  if (e.nameSimilarity !== null) parts.push(`name similarity ${e.nameSimilarity.toFixed(2)}`);
  if (e.sameOperator) parts.push('same operator');
  const reason = parts.join(', ');
  if (!Number.isFinite(e.distanceM) || e.distanceM < 0 || e.distanceM > DEDUPE_SEARCH_RADIUS_M) {
    return { candidate: false, reason };
  }
  if (e.distanceM <= DEDUPE_NEAR_RADIUS_M) return { candidate: true, reason };
  const similar = e.nameSimilarity !== null && e.nameSimilarity >= DEDUPE_NAME_SIMILARITY;
  return { candidate: similar || e.sameOperator, reason };
}

/** Ordered pair (station_id < other_station_id, CHECK in the database). */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
