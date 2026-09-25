/**
 * Explainable, deterministic ranking by usage, budget and home charging
 * (REQUIREMENTS §7). Rules:
 * - hard constraints (budget in the local currency, seats, body type,
 *   powertrain) filter; unknown price / seats are NOT guessed — such cars are
 *   listed as "not ranked" with the reason;
 * - visible weights (defaults derived from the answers, overridable), each
 *   factor contributes weight × position-among-cars; the sum is the score;
 * - a car is ranked only when every weighted factor is available and
 *   comparable (same range cycle, same consumption cycle + mode); missing
 *   values never become 0 (a recorded absence of a DC inlet is a real 0);
 * - no decisive verdict with < 2 comparable cars or when the top scores are
 *   within 3 points;
 * - the input never contains ads or sponsorship data, so they cannot change
 *   the result (every result says `sponsored: false`).
 */
import {
  cycleId,
  cycleLabel,
  cycleRank,
  dcCapability,
  inletMax,
  isNum,
  MODE_ORDER,
  modeOf,
} from '../../comparisons/engine/facts';
import type { CarFacts } from '../../comparisons/engine/types';
import {
  DECISION_MESSAGES,
  FACTOR_DESCRIPTIONS,
  FACTOR_LABELS,
  fmt,
  MISSING_DETAIL,
  NOT_RANKED_TEXT,
  NOTES,
  SUGGESTION,
  tt,
  WEIGHT_NOTES,
} from './texts';
import {
  FACTORS,
  type Candidate,
  type Contribution,
  type Decision,
  type Factor,
  type FactorAvailability,
  type FactorValue,
  type FactorWeight,
  type Lang,
  type MissingItem,
  type NotRankedCar,
  type RankedCar,
  type Reason,
  type RecoInput,
  type RecoResult,
  type Sentiment,
} from './types';

/** Minimum lead (points on 0–100) of the top car for a decisive recommendation. */
export const DECISIVE_MARGIN = 3;

const DIRECTION: Record<Factor, 'higher' | 'lower'> = {
  price: 'lower',
  range: 'higher',
  dcCharging: 'higher',
  acCharging: 'higher',
  efficiency: 'lower',
  space: 'higher',
  performance: 'lower',
};

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// --- weights ---------------------------------------------------------------------------

export function resolveWeights(
  input: RecoInput,
  lang: Lang,
): { weights: FactorWeight[]; notes: string[] } {
  const notes: string[] = [];
  const longTrips = input.longTripsPerMonth >= 2;
  const raw: Record<Factor, { raw: number; source: FactorWeight['source'] }> = {
    price: { raw: 3, source: 'default' },
    range: {
      raw: 3 + (longTrips ? 1 : 0) + (input.dailyKm >= 100 ? 1 : 0),
      source: longTrips || input.dailyKm >= 100 ? 'usage' : 'default',
    },
    dcCharging: {
      raw: 1 + (longTrips ? 1 : 0) + (input.homeCharging ? 0 : 1),
      source: longTrips || !input.homeCharging ? 'usage' : 'default',
    },
    acCharging: { raw: input.homeCharging ? 1 : 0.5, source: 'usage' },
    efficiency: {
      raw: 1 + (input.dailyKm >= 60 ? 1 : 0),
      source: input.dailyKm >= 60 ? 'usage' : 'default',
    },
    space: { raw: 1, source: 'default' },
    performance: { raw: 0.5, source: 'default' },
  };
  if (longTrips) notes.push(tt(lang, WEIGHT_NOTES.longTrips));
  if (input.dailyKm >= 100) notes.push(tt(lang, WEIGHT_NOTES.highDaily));
  if (input.dailyKm >= 60) notes.push(tt(lang, WEIGHT_NOTES.efficiencyDaily));
  notes.push(tt(lang, input.homeCharging ? WEIGHT_NOTES.home : WEIGHT_NOTES.noHome));
  let userSet = false;
  for (const f of FACTORS) {
    const w = input.weights?.[f];
    if (w !== undefined && w !== null) {
      raw[f] = { raw: w, source: 'user' };
      userSet = true;
    }
  }
  if (userSet) notes.push(tt(lang, WEIGHT_NOTES.user));
  const sum = FACTORS.reduce((s, f) => s + raw[f].raw, 0);
  const weights = FACTORS.map((f): FactorWeight => ({
    factor: f,
    label: tt(lang, FACTOR_LABELS[f]),
    weight: sum > 0 ? round(raw[f].raw / sum, 4) : 0,
    raw: raw[f].raw,
    source: raw[f].source,
    betterDirection: DIRECTION[f],
    description: tt(lang, FACTOR_DESCRIPTIONS[f]),
  }));
  return { weights, notes };
}

// --- factor values -----------------------------------------------------------------------

function pickBasis(keysPerCar: string[][], rank: (k: string) => number): string | null {
  const counts = new Map<string, number>();
  for (const keys of keysPerCar)
    for (const k of new Set(keys)) counts.set(k, (counts.get(k) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]));
  return sorted[0]?.[0] ?? null;
}

const modeRank = (m: string) => {
  const i = MODE_ORDER.indexOf(m);
  return i === -1 ? MODE_ORDER.length : i;
};
const consumptionKeyRank = (k: string) => {
  const [c, m] = k.split('|');
  return cycleRank(c) * 10 + modeRank(m);
};

interface Bases {
  rangeCycle: string | null;
  consumptionKey: string | null;
}

export function chooseBases(cars: CarFacts[]): Bases {
  const rangeCycle = pickBasis(
    cars.map((c) =>
      c.ranges.filter((r) => r.rangeType === 'electric').map((r) => cycleId(r.cycle, r.cycleNote)),
    ),
    cycleRank,
  );
  const consumptionKey = pickBasis(
    cars.map((c) =>
      c.consumption
        .filter((x) => x.kind === 'electricity')
        .map((x) => `${cycleId(x.cycle, x.cycleNote)}|${modeOf(x.mode)}`),
    ),
    consumptionKeyRank,
  );
  return { rangeCycle, consumptionKey };
}

const specNum = (car: CarFacts, key: string): number | null => {
  const p = car.specs.get(key);
  return p && isNum(p.value) ? p.value : null;
};

export function factorValue(car: CarFacts, factor: Factor, bases: Bases): FactorValue {
  const missing: FactorValue = { status: 'missing', value: null, unit: null, basis: null };
  switch (factor) {
    case 'price': {
      const p = car.price;
      if (!p || !p.inMarketCurrency) return missing;
      return {
        status: 'present',
        value: Number(p.amount.amount),
        unit: p.amount.currency,
        basis: p.priceType,
      };
    }
    case 'range': {
      const rows = car.ranges.filter((r) => r.rangeType === 'electric');
      if (rows.length === 0 || !bases.rangeCycle) return missing;
      const on = rows.filter((r) => cycleId(r.cycle, r.cycleNote) === bases.rangeCycle);
      if (on.length === 0) return { ...missing, status: 'cycle_mismatch' };
      const best = on.reduce((a, b) => (b.valueKm > a.valueKm ? b : a));
      return {
        status: 'present',
        value: best.valueKm,
        unit: 'km',
        basis: cycleLabel(best.cycle, best.cycleNote),
      };
    }
    case 'efficiency': {
      const rows = car.consumption.filter((x) => x.kind === 'electricity');
      if (rows.length === 0 || !bases.consumptionKey) return missing;
      const [cycle, mode] = bases.consumptionKey.split('|');
      const sameCycle = rows.filter((x) => cycleId(x.cycle, x.cycleNote) === cycle);
      const on = sameCycle.filter((x) => modeOf(x.mode) === mode);
      if (on.length === 0) {
        return { ...missing, status: sameCycle.length > 0 ? 'mode_mismatch' : 'cycle_mismatch' };
      }
      const best = on.reduce((a, b) => (b.value < a.value ? b : a));
      return {
        status: 'present',
        value: best.value,
        unit: 'Wh/km',
        basis: cycleLabel(best.cycle, best.cycleNote),
      };
    }
    case 'dcCharging': {
      const v =
        specNum(car, 'charging.dc_peak_kw') ?? inletMax(car.inlets, 'DC')?.maxPowerKw ?? null;
      if (v !== null) return { status: 'present', value: v, unit: 'kW', basis: 'peak' };
      // A recorded absence (inlets known, none DC) is a real 0 — not a missing value.
      if (dcCapability(car) === false) {
        return { status: 'present', value: 0, unit: 'kW', basis: 'peak', knownAbsent: true };
      }
      return missing;
    }
    case 'acCharging': {
      const v =
        specNum(car, 'charging.ac_max_kw') ?? inletMax(car.inlets, 'AC')?.maxPowerKw ?? null;
      return v === null ? missing : { status: 'present', value: v, unit: 'kW', basis: null };
    }
    case 'space': {
      const v = specNum(car, 'practicality.trunk_l');
      return v === null ? missing : { status: 'present', value: v, unit: 'l', basis: null };
    }
    case 'performance': {
      const v = specNum(car, 'performance.accel_0_100_s');
      return v === null ? missing : { status: 'present', value: v, unit: 's', basis: null };
    }
  }
}

// --- reasons ------------------------------------------------------------------------------

function sentimentOf(score: number, many: boolean): Sentiment {
  if (!many) return 'neutral';
  if (score >= 0.67) return 'positive';
  if (score <= 0.33) return 'negative';
  return 'neutral';
}

function reasonFor(
  factor: Factor,
  v: FactorValue,
  score: number,
  many: boolean,
  input: RecoInput,
  car: CarFacts,
  lang: Lang,
): Reason | null {
  const value = v.value as number;
  let sentiment = sentimentOf(score, many);
  const R = (code: string, text: { ar: string; en: string }, params: Reason['params']): Reason => ({
    factor,
    code,
    sentiment,
    text: tt(lang, text),
    params,
  });
  switch (factor) {
    case 'price': {
      const pct = input.budget > 0 ? Math.max(0, Math.round((1 - value / input.budget) * 100)) : 0;
      const amount = fmt(value, 2);
      const params = {
        amount: car.price!.amount.amount,
        currency: v.unit,
        priceType: v.basis,
        belowBudgetPercent: pct,
      };
      return pct >= 1
        ? R(
            'PRICE_BELOW_BUDGET',
            {
              ar: `السعر ${amount} ${v.unit} (${car.price!.priceTypeLabel}) — أقل من ميزانيتك بنسبة ${pct}%.`,
              en: `Price ${amount} ${v.unit} (${car.price!.priceTypeLabel}) — ${pct}% below your budget.`,
            },
            params,
          )
        : R(
            'PRICE_AT_BUDGET',
            {
              ar: `السعر ${amount} ${v.unit} (${car.price!.priceTypeLabel}) — في حدود ميزانيتك.`,
              en: `Price ${amount} ${v.unit} (${car.price!.priceTypeLabel}) — within your budget.`,
            },
            params,
          );
    }
    case 'range': {
      const km = fmt(value, 0);
      const params = { km: value, cycle: v.basis, dailyKm: input.dailyKm };
      if (input.dailyKm > 0 && value < input.dailyKm) {
        sentiment = 'negative';
        return car.powertrainType === 'BEV'
          ? R(
              'RANGE_BELOW_DAILY',
              {
                ar: `المدى الكهربائي ${km} كم (${v.basis}) أقل من مشوارك اليومي ${fmt(input.dailyKm, 0)} كم؛ ستحتاج للشحن أكثر من مرة يوميًا.`,
                en: `Electric range ${km} km (${v.basis}) is below your ${fmt(input.dailyKm, 0)} km daily driving; you would need to charge more than once a day.`,
              },
              params,
            )
          : R(
              'RANGE_BELOW_DAILY_HYBRID',
              {
                ar: `المدى الكهربائي ${km} كم (${v.basis}) أقل من مشوارك اليومي ${fmt(input.dailyKm, 0)} كم؛ الباقي سيعمل بالوقود.`,
                en: `Electric range ${km} km (${v.basis}) is below your ${fmt(input.dailyKm, 0)} km daily driving; the rest would run on fuel.`,
              },
              params,
            );
      }
      if (input.dailyKm > 0) {
        const days = Math.floor(value / input.dailyKm);
        return R(
          'RANGE_COVERS_DAYS',
          {
            ar: `المدى الكهربائي ${km} كم (${v.basis}) — نحو ${days} يوم من مشوارك اليومي ${fmt(input.dailyKm, 0)} كم لكل شحنة (رقم دورة القياس؛ الفعلي عادة أقل).`,
            en: `Electric range ${km} km (${v.basis}) — about ${days} days of your ${fmt(input.dailyKm, 0)} km daily driving per charge (test-cycle figure; real-world range is usually lower).`,
          },
          { ...params, days },
        );
      }
      return R(
        'RANGE',
        {
          ar: `المدى الكهربائي ${km} كم (${v.basis}).`,
          en: `Electric range ${km} km (${v.basis}).`,
        },
        params,
      );
    }
    case 'dcCharging': {
      if (v.knownAbsent) {
        sentiment = 'negative';
        return R(
          'NO_DC_CHARGING',
          {
            ar: 'لا يوجد منفذ شحن سريع DC مسجل لهذه الفئة في هذا السوق؛ الرحلات الطويلة تحتاج توقفات شحن أطول.',
            en: 'No DC fast-charging inlet is recorded for this trim in this market; long trips need longer charging stops.',
          },
          { kw: 0 },
        );
      }
      const kw = fmt(value, 0);
      return input.longTripsPerMonth > 0
        ? R(
            'DC_FOR_TRIPS',
            {
              ar: `شحن سريع حتى ${kw} كيلوواط (ذروة)، مفيد لرحلاتك الطويلة (${input.longTripsPerMonth} شهريًا).`,
              en: `DC fast charging up to ${kw} kW (peak), useful for your ${input.longTripsPerMonth} long trips a month.`,
            },
            { kw: value, longTripsPerMonth: input.longTripsPerMonth },
          )
        : R(
            'DC',
            {
              ar: `شحن سريع حتى ${kw} كيلوواط (ذروة وليست متوسط القدرة).`,
              en: `DC fast charging up to ${kw} kW (peak, not the average power).`,
            },
            { kw: value },
          );
    }
    case 'acCharging': {
      const kw = fmt(value, 1);
      return input.homeCharging
        ? R(
            'AC_HOME',
            {
              ar: `شحن متردد حتى ${kw} كيلوواط للشحن المنزلي (يعتمد على شاحن المنزل).`,
              en: `AC charging up to ${kw} kW for home charging (depends on your home charger).`,
            },
            { kw: value },
          )
        : R(
            'AC',
            { ar: `شحن متردد حتى ${kw} كيلوواط.`, en: `AC charging up to ${kw} kW.` },
            { kw: value },
          );
    }
    case 'efficiency':
      return R(
        'EFFICIENCY',
        {
          ar: `استهلاك ${fmt(value, 0)} واط·س/كم (${v.basis}).`,
          en: `Consumption ${fmt(value, 0)} Wh/km (${v.basis}).`,
        },
        { whPerKm: value, cycle: v.basis },
      );
    case 'space':
      return R(
        'TRUNK',
        { ar: `صندوق سعته ${fmt(value, 0)} لتر.`, en: `Trunk ${fmt(value, 0)} L.` },
        { litres: value },
      );
    case 'performance':
      return R(
        'ACCEL',
        {
          ar: `من 0 إلى 100 كم/س في ${fmt(value, 1)} ث.`,
          en: `0–100 km/h in ${fmt(value, 1)} s.`,
        },
        { seconds: value },
      );
  }
}

function fitReasons(car: CarFacts, input: RecoInput, lang: Lang): Reason[] {
  const out: Reason[] = [
    {
      factor: 'fit',
      code: 'SEATS_FIT',
      sentiment: 'neutral',
      text: tt(lang, {
        ar: `${car.seats} مقاعد (تحتاج ${input.seatsNeeded}).`,
        en: `${car.seats} seats (you need ${input.seatsNeeded}).`,
      }),
      params: { seats: car.seats, seatsNeeded: input.seatsNeeded },
    },
  ];
  if (!input.homeCharging && car.powertrainType !== 'BEV') {
    out.push({
      factor: 'fit',
      code: 'HYBRID_NO_HOME_CHARGING',
      sentiment: 'neutral',
      text: tt(lang, {
        ar: 'بدون شحن منزلي تعمل السيارة الهجينة القابلة للشحن غالبًا بالوقود.',
        en: 'Without home charging, a plug-in hybrid often runs on fuel.',
      }),
      params: {},
    });
  }
  if (!input.homeCharging && car.powertrainType === 'BEV') {
    out.push({
      factor: 'fit',
      code: 'BEV_NO_HOME_CHARGING',
      sentiment: 'neutral',
      text: tt(lang, {
        ar: 'بدون شحن منزلي ستعتمد على الشواحن العامة؛ راجع المحطات القريبة منك.',
        en: 'Without home charging you would rely on public chargers; check the stations near you.',
      }),
      params: {},
    });
  }
  return out;
}

// --- main -----------------------------------------------------------------------------------

export function recommend(candidates: Candidate[], input: RecoInput, lang: Lang): RecoResult {
  const excluded = { total: 0, overBudget: 0, seatsTooFew: 0, bodyType: 0, powertrain: 0 };
  const notRanked: NotRankedCar[] = [];
  const eligible: CarFacts[] = [];

  for (const c of candidates) {
    const car = c.facts;
    if (!input.powertrains.includes(car.powertrainType)) {
      excluded.powertrain++;
      continue;
    }
    if (
      input.bodyTypes &&
      input.bodyTypes.length > 0 &&
      (!c.bodyType || !input.bodyTypes.includes(c.bodyType))
    ) {
      excluded.bodyType++;
      continue;
    }
    if (car.seats !== null && car.seats < input.seatsNeeded) {
      excluded.seatsTooFew++;
      continue;
    }
    const price = car.price && car.price.inMarketCurrency ? Number(car.price.amount.amount) : null;
    if (price !== null && price > input.budget) {
      excluded.overBudget++;
      continue;
    }
    if (price === null) {
      notRanked.push({
        key: car.key,
        reason: 'price_not_available',
        missingData: [
          {
            factor: 'price',
            label: tt(lang, FACTOR_LABELS.price),
            reason: 'missing',
            detail: tt(lang, MISSING_DETAIL.missing),
          },
        ],
        explanation: tt(lang, NOT_RANKED_TEXT.price_not_available),
      });
      continue;
    }
    if (car.seats === null) {
      notRanked.push({
        key: car.key,
        reason: 'seats_not_available',
        missingData: [
          {
            factor: 'seats',
            label: tt(lang, { ar: 'عدد المقاعد', en: 'Seats' }),
            reason: 'missing',
            detail: tt(lang, MISSING_DETAIL.missing),
          },
        ],
        explanation: tt(lang, NOT_RANKED_TEXT.seats_not_available),
      });
      continue;
    }
    eligible.push(car);
  }
  excluded.total =
    excluded.overBudget + excluded.seatsTooFew + excluded.bodyType + excluded.powertrain;

  const { weights, notes: weightNotes } = resolveWeights(input, lang);
  const active = weights.filter((w) => w.weight > 0);
  const bases = chooseBases(eligible);
  const [consCycle, consMode] = bases.consumptionKey?.split('|') ?? [null, null];

  const values = new Map(
    eligible.map((car) => [
      car.key,
      new Map(active.map((w) => [w.factor, factorValue(car, w.factor, bases)])),
    ]),
  );

  const availability: FactorAvailability[] = active.map((w) => {
    const vs = eligible.map((car) => values.get(car.key)!.get(w.factor)!);
    const missing = vs.filter((v) => v.status === 'missing').length;
    const notComparable = vs.filter(
      (v) => v.status === 'cycle_mismatch' || v.status === 'mode_mismatch',
    ).length;
    return {
      factor: w.factor,
      label: w.label,
      available: vs.length - missing - notComparable,
      missing,
      notComparable,
      suggestion: missing + notComparable > 0 ? tt(lang, SUGGESTION(w.label)) : null,
    };
  });

  const complete: CarFacts[] = [];
  for (const car of eligible) {
    const vs = values.get(car.key)!;
    const problems: MissingItem[] = [];
    for (const w of active) {
      const v = vs.get(w.factor)!;
      if (v.status === 'present') continue;
      const detail =
        v.status === 'missing'
          ? MISSING_DETAIL.missing
          : v.status === 'cycle_mismatch'
            ? MISSING_DETAIL.cycle_mismatch(
                (w.factor === 'range' ? cycleLabelOf(bases.rangeCycle) : cycleLabelOf(consCycle)) ??
                  '',
              )
            : MISSING_DETAIL.mode_mismatch(consMode ?? '');
      problems.push({
        factor: w.factor,
        label: w.label,
        reason: v.status,
        detail: tt(lang, detail),
      });
    }
    if (problems.length === 0) {
      complete.push(car);
      continue;
    }
    const onlyMismatch = problems.every((p) => p.reason !== 'missing');
    notRanked.push({
      key: car.key,
      reason: onlyMismatch ? 'not_comparable' : 'missing_data',
      missingData: problems,
      explanation: tt(
        lang,
        onlyMismatch ? NOT_RANKED_TEXT.not_comparable : NOT_RANKED_TEXT.missing_data,
      ),
    });
  }

  // Position of each car among the ranked cars, per factor (1 = best).
  const many = complete.length > 1;
  const scored = complete.map((car) => {
    const vs = values.get(car.key)!;
    const contributions: Contribution[] = active.map((w) => {
      const all = complete.map((c) => values.get(c.key)!.get(w.factor)!.value as number);
      const min = Math.min(...all);
      const max = Math.max(...all);
      const v = vs.get(w.factor)!;
      const x = v.value as number;
      const score =
        max === min
          ? 1
          : DIRECTION[w.factor] === 'higher'
            ? (x - min) / (max - min)
            : (max - x) / (max - min);
      return {
        factor: w.factor,
        label: w.label,
        weight: w.weight,
        score: round(score, 4),
        points: round(w.weight * score * 100, 2),
        value: v.value,
        unit: v.unit,
        basis: v.basis,
      };
    });
    const total = round(
      contributions.reduce((s, c) => s + c.weight * c.score * 100, 0),
      1,
    );
    const reasons = [
      ...[...contributions]
        .sort((a, b) => b.points - a.points)
        .map((c) => reasonFor(c.factor, vs.get(c.factor)!, c.score, many, input, car, lang))
        .filter((r): r is Reason => r !== null),
      ...fitReasons(car, input, lang),
    ];
    return { car, total, contributions, reasons };
  });
  scored.sort(
    (a, b) =>
      b.total - a.total ||
      Number(a.car.price!.amount.amount) - Number(b.car.price!.amount.amount) ||
      a.car.key.localeCompare(b.car.key),
  );

  const ranked: RankedCar[] = scored.slice(0, input.limit).map((s, i) => ({
    rank: i + 1,
    key: s.car.key,
    score: s.total,
    contributions: s.contributions,
    reasons: s.reasons,
    sponsored: false,
  }));

  const decision = decide(
    scored.map((s) => ({ key: s.car.key, total: s.total })),
    eligible.length + notRanked.length,
    lang,
  );

  return {
    weights,
    weightNotes,
    basis: {
      rangeCycle: cycleLabelOf(bases.rangeCycle),
      consumptionCycle: cycleLabelOf(consCycle),
      consumptionMode: consMode,
      currency: input.currency,
    },
    decision,
    ranked,
    notRanked,
    excluded,
    factorAvailability: availability,
    candidatesConsidered: candidates.length,
    notes: [tt(lang, NOTES.cycles), tt(lang, NOTES.prices)],
  };
}

function cycleLabelOf(id: string | null): string | null {
  if (!id) return null;
  return id.startsWith('OTHER:') ? id.slice(6) || 'OTHER' : id;
}

export function decide(
  scores: { key: string; total: number }[],
  matching: number,
  lang: Lang,
): Decision {
  const no = (reason: Exclude<Decision['reason'], null>): Decision => ({
    decisive: false,
    reason,
    message: tt(lang, DECISION_MESSAGES[reason]),
    topPickKey: null,
  });
  if (scores.length === 0) return no(matching === 0 ? 'no_candidates' : 'no_comparable_candidates');
  if (scores.length === 1) return no('fewer_than_two_comparable');
  if (scores[0].total - scores[1].total < DECISIVE_MARGIN) return no('scores_too_close');
  return {
    decisive: true,
    reason: null,
    message: tt(lang, DECISION_MESSAGES.decisive),
    topPickKey: scores[0].key,
  };
}
