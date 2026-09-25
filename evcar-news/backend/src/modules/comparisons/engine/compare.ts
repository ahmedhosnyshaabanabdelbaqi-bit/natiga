/**
 * Assembles the comparison: metric rows grouped in the §7 order (price,
 * range, battery, consumption, charging, performance, space, safety,
 * warranty, features), summary vs detailed view and "differences only".
 * Pure: the same facts always give the same result (no ads, no sponsorship,
 * no randomness).
 */
import { GROUP_LABELS, NOTES, t } from './labels';
import {
  acMaxMetric,
  attributeMetrics,
  chargingTimeMetric,
  consumptionMetric,
  dcAverageMetric,
  dcPeakMetric,
  inletsMetric,
  metricGroupOf,
  priceMetric,
  rangeMetric,
  SPECIAL_SPEC_KEYS,
  specMetric,
  type Ctx,
} from './metrics';
import {
  METRIC_GROUPS,
  type CarFacts,
  type CompareOptions,
  type ComparisonSummary,
  type EngineResult,
  type Metric,
  type MetricGroup,
  type MetricGroupKey,
  type SpecDefLite,
} from './types';

const SPEC_GROUP_ORDER = [
  'battery',
  'charging',
  'performance',
  'dimensions',
  'practicality',
  'safety',
  'comfort',
  'tech',
  'warranty',
];

function sortDefs(defs: SpecDefLite[]): SpecDefLite[] {
  const rank = (g: string) => {
    const i = SPEC_GROUP_ORDER.indexOf(g);
    return i === -1 ? SPEC_GROUP_ORDER.length : i;
  };
  return [...defs].sort(
    (a, b) =>
      rank(a.group) - rank(b.group) ||
      a.group.localeCompare(b.group) ||
      a.sortOrder - b.sortOrder ||
      a.key.localeCompare(b.key),
  );
}

/** Every row of a comparison, in display order within each group. */
export function buildMetrics(
  cars: CarFacts[],
  defs: SpecDefLite[],
  lang: CompareOptions['lang'],
): Metric[] {
  const ctx: Ctx = { lang, cars };
  const comparable = sortDefs(defs.filter((d) => d.isComparable));
  const byKey = new Map(comparable.map((d) => [d.key, d]));
  const specRows = (group: MetricGroupKey) =>
    comparable
      .filter((d) => !SPECIAL_SPEC_KEYS.has(d.key) && metricGroupOf(d) === group)
      .map((d) => specMetric(ctx, d));
  const [seats, doors, drive] = attributeMetrics(ctx);

  const rows: (Metric | null)[] = [
    priceMetric(ctx),
    rangeMetric(ctx, 'electric'),
    rangeMetric(ctx, 'total'),
    ...specRows('battery'),
    consumptionMetric(ctx, 'electricity'),
    consumptionMetric(ctx, 'fuel'),
    cars.some((c) => c.powertrainType !== 'HEV')
      ? dcPeakMetric(ctx, byKey.get('charging.dc_peak_kw'))
      : null,
    cars.some((c) => c.powertrainType !== 'HEV')
      ? acMaxMetric(ctx, byKey.get('charging.ac_max_kw'))
      : null,
    chargingTimeMetric(ctx, 'DC'),
    dcAverageMetric(ctx),
    chargingTimeMetric(ctx, 'AC'),
    inletsMetric(ctx),
    ...specRows('charging'),
    ...specRows('performance'),
    drive,
    seats,
    doors,
    ...specRows('space'),
    ...specRows('safety'),
    ...specRows('warranty'),
    ...specRows('features'),
  ];
  return rows.filter((m): m is Metric => m !== null);
}

export function summarize(
  metrics: Metric[],
  cars: CarFacts[],
  lang: CompareOptions['lang'],
): ComparisonSummary {
  const wins = new Map(cars.map((c) => [c.key, 0]));
  for (const m of metrics) {
    if (m.outcome !== 'winner') continue;
    for (const k of m.winners) wins.set(k, (wins.get(k) ?? 0) + 1);
  }
  const count = (pred: (m: Metric) => boolean) => metrics.filter(pred).length;
  return {
    metricsTotal: metrics.length,
    comparableMetrics: count((m) => m.comparability === 'comparable'),
    decidedMetrics: count((m) => m.outcome === 'winner'),
    notComparableMetrics: count(
      (m) =>
        m.comparability === 'not_comparable_cycles' ||
        m.comparability === 'not_comparable_soc_window' ||
        m.comparability === 'not_comparable_conditions' ||
        m.comparability === 'different_currency',
    ),
    missingDataMetrics: count((m) => m.comparability === 'missing_data'),
    notApplicableMetrics: count((m) => m.comparability === 'not_applicable'),
    winsByCar: cars.map((c) => ({ carKey: c.key, wins: wins.get(c.key) ?? 0 })),
    note: NOTES.summary(lang),
  };
}

/**
 * Runs the engine. `view=summary` keeps the key rows only; `differencesOnly`
 * drops rows where every car shows the same value (every row still carries
 * `isDifferent`, so clients can toggle locally without a new request).
 */
export function compareCars(
  cars: CarFacts[],
  defs: SpecDefLite[],
  opts: CompareOptions,
): EngineResult {
  const all = buildMetrics(cars, defs, opts.lang);
  const viewRows = opts.view === 'summary' ? all.filter((m) => m.isKey) : all;
  const summary = summarize(viewRows, cars, opts.lang);
  const shown = opts.differencesOnly ? viewRows.filter((m) => m.isDifferent) : viewRows;
  const groups: MetricGroup[] = METRIC_GROUPS.map((key) => ({
    key,
    label: t(opts.lang, GROUP_LABELS[key]),
    metrics: shown.filter((m) => m.group === key),
  })).filter((g) => g.metrics.length > 0);
  return { groups, summary };
}
