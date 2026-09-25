/**
 * Bilingual labels and explanations of the comparison engine. Every note
 * says WHY no winner is declared, so clients never have to guess.
 */
import type { Comparability, Lang, MetricGroupKey } from './types';

export interface Bi {
  ar: string;
  en: string;
}

export const t = (lang: Lang, text: Bi): string => text[lang];

export const GROUP_LABELS: Record<MetricGroupKey, Bi> = {
  price: { ar: 'السعر', en: 'Price' },
  range: { ar: 'المدى', en: 'Range' },
  battery: { ar: 'البطارية', en: 'Battery' },
  consumption: { ar: 'الاستهلاك', en: 'Consumption' },
  charging: { ar: 'الشحن', en: 'Charging' },
  performance: { ar: 'الأداء', en: 'Performance' },
  space: { ar: 'المساحة والأبعاد', en: 'Space & dimensions' },
  safety: { ar: 'الأمان', en: 'Safety' },
  warranty: { ar: 'الضمان', en: 'Warranty' },
  features: { ar: 'التجهيزات', en: 'Features' },
};

/** Rows that are computed by the engine (not plain spec definitions). */
export const METRIC_LABELS: Record<string, { label: Bi; description?: Bi }> = {
  'price.current': {
    label: { ar: 'السعر الحالي في السوق', en: 'Current price in the market' },
    description: {
      ar: 'السعر الساري اليوم في سوق كل سيارة مع نوعه وتاريخه ومصدره. لا تُحوّل العملات.',
      en: "Price valid today in each car's market, with its type, date and source. Currencies are never converted.",
    },
  },
  'range.electric': {
    label: { ar: 'المدى الكهربائي', en: 'Electric range' },
    description: {
      ar: 'بحسب دورة القياس المذكورة بجوار كل رقم؛ لا نحوّل بين الدورات.',
      en: 'Per the test cycle shown next to each figure; never converted between cycles.',
    },
  },
  'range.total': {
    label: { ar: 'المدى الإجمالي (وقود + كهرباء)', en: 'Total range (fuel + electric)' },
    description: {
      ar: 'للسيارات الهجينة فقط، ويُعرض منفصلًا عن المدى الكهربائي.',
      en: 'Hybrids only, always shown separately from the electric range.',
    },
  },
  'consumption.electricity': {
    label: { ar: 'استهلاك الكهرباء', en: 'Electricity consumption' },
  },
  'consumption.fuel': { label: { ar: 'استهلاك الوقود', en: 'Fuel consumption' } },
  'charging.dc_peak_kw': {
    label: { ar: 'أقصى قدرة شحن سريع DC (ذروة)', en: 'Peak DC charging power' },
    description: {
      ar: 'قدرة الذروة وليست متوسط القدرة طوال الشحن.',
      en: 'Peak power, not the average power over a charge.',
    },
  },
  'charging.dc_time': {
    label: { ar: 'زمن الشحن السريع DC', en: 'DC fast-charging time' },
    description: {
      ar: 'يُقارن فقط لنفس نطاق نسبة الشحن (مثل 10–80%).',
      en: 'Compared only for the same state-of-charge window (e.g. 10–80%).',
    },
  },
  'charging.dc_average_kw': {
    label: { ar: 'متوسط قدرة الشحن DC', en: 'Average DC charging power' },
    description: {
      ar: 'متوسط القدرة المقاس في نفس نطاق نسبة الشحن، منفصل عن قدرة الذروة.',
      en: 'Measured average power in the same state-of-charge window, separate from the peak power.',
    },
  },
  'charging.ac_time': { label: { ar: 'زمن الشحن المتردد AC', en: 'AC charging time' } },
  'charging.inlets': {
    label: { ar: 'منافذ الشحن في هذا السوق', en: 'Charging inlets in this market' },
  },
  'performance.drive_type': { label: { ar: 'نظام الدفع', en: 'Drive' } },
  'space.seats': { label: { ar: 'عدد المقاعد', en: 'Seats' } },
  'space.doors': { label: { ar: 'عدد الأبواب', en: 'Doors' } },
};

export const DRIVE_LABELS: Record<string, Bi> = {
  fwd: { ar: 'دفع أمامي', en: 'Front-wheel drive' },
  rwd: { ar: 'دفع خلفي', en: 'Rear-wheel drive' },
  awd: { ar: 'دفع رباعي', en: 'All-wheel drive' },
};

export const MODE_LABELS: Record<string, Bi> = {
  combined: { ar: 'مختلط', en: 'combined' },
  charge_depleting: { ar: 'استنزاف الشحن', en: 'charge-depleting' },
  charge_sustaining: { ar: 'الحفاظ على الشحن', en: 'charge-sustaining' },
  weighted: { ar: 'مرجّح', en: 'weighted' },
};

export const POWERTRAIN_LABELS: Record<string, Bi> = {
  BEV: { ar: 'كهربائية بالكامل', en: 'fully electric' },
  PHEV: { ar: 'هجينة قابلة للشحن', en: 'plug-in hybrid' },
  EREV: { ar: 'كهربائية بموسّع مدى', en: 'range extender' },
  HEV: { ar: 'هجينة', en: 'hybrid' },
};

const join = (lang: Lang, parts: string[]): string => parts.join(lang === 'ar' ? ' / ' : ' vs ');

/** Explanations of a comparability status (null for plain comparable rows). */
export const NOTES = {
  missing: (lang: Lang): string =>
    t(lang, {
      ar: 'بعض القيم غير متوفرة؛ لا نعتبر القيمة الناقصة صفرًا ولا نعلن فائزًا.',
      en: 'Some values are not available; a missing value is never treated as 0, so no winner is declared.',
    }),
  cycles: (lang: Lang, cycles: string[]): string =>
    t(lang, {
      ar: `القيم مقاسة بدورات قياس مختلفة (${join(lang, cycles)})؛ لا نحوّل بين الدورات ولا نعلن فائزًا.`,
      en: `Measured with different test cycles (${join(lang, cycles)}); cycles are never converted, so no winner is declared.`,
    }),
  socWindows: (lang: Lang, windows: string[]): string =>
    t(lang, {
      ar: `أزمنة الشحن لنطاقات شحن مختلفة (${join(lang, windows)}) ولا تُقارن كأنها متكافئة.`,
      en: `Charging times cover different state-of-charge windows (${join(lang, windows)}) and are not treated as equivalent.`,
    }),
  chargers: (lang: Lang, powers: string[]): string =>
    t(lang, {
      ar: `قيست بشواحن بقدرات مختلفة (${join(lang, powers)}) حدّت من سرعة الشحن؛ لا نعلن فائزًا.`,
      en: `Measured on chargers of different power (${join(lang, powers)}) that limited the charging speed, so no winner is declared.`,
    }),
  modes: (lang: Lang, modes: string[]): string =>
    t(lang, {
      ar: `قيم الاستهلاك مقاسة بأنماط تشغيل مختلفة (${join(lang, modes)})؛ لا نعلن فائزًا.`,
      en: `Consumption was measured in different operating modes (${join(lang, modes)}), so no winner is declared.`,
    }),
  currencies: (lang: Lang, currencies: string[]): string =>
    t(lang, {
      ar: `الأسعار بعملات مختلفة (${join(lang, currencies)})؛ لا نحوّل العملات ولا نعلن فائزًا.`,
      en: `Prices are in different currencies (${join(lang, currencies)}); currencies are never converted, so no winner is declared.`,
    }),
  priceTypes: (lang: Lang, types: string[]): string =>
    t(lang, {
      ar: `تنبيه: أنواع أسعار مختلفة (${join(lang, types)}).`,
      en: `Note: different price types (${join(lang, types)}).`,
    }),
  notApplicable: (lang: Lang, key: string): string =>
    key === 'range.total'
      ? t(lang, {
          ar: 'المدى الإجمالي يخص السيارات الهجينة؛ مدى السيارة الكهربائية بالكامل هو مداها الكهربائي، ولا نخلط بينهما.',
          en: "Total range applies to hybrids; a fully electric car's range is its electric range, and the two are never mixed.",
        })
      : t(lang, {
          ar: 'هذا المؤشر لا ينطبق على كل السيارات المقارنة (نوع الدفع مختلف)؛ لا نعلن فائزًا.',
          en: 'This metric does not apply to every car compared (different powertrain), so no winner is declared.',
        }),
  batteryNoWinner: (lang: Lang): string =>
    t(lang, {
      ar: 'البطارية الأكبر ليست فوزًا تلقائيًا: تزيد الوزن والسعر وزمن الشحن. اقرأها مع المدى والاستهلاك.',
      en: 'A bigger battery is not an automatic win: it adds weight, cost and charging time. Read it with range and consumption.',
    }),
  disputed: (lang: Lang): string =>
    t(lang, {
      ar: 'قيمة واحدة على الأقل متنازع عليها؛ لا نعلن فائزًا.',
      en: 'At least one value is disputed, so no winner is declared.',
    }),
  bestOf: (lang: Lang, n: number, higher: boolean): string =>
    t(lang, {
      ar: `${higher ? 'أعلى' : 'أقل'} قيمة من ${n} قيم لنفس الأساس (مثل مقاسات جنوط أو شواحن مختلفة).`,
      en: `${higher ? 'Highest' : 'Lowest'} of ${n} values on the same basis (e.g. different wheel sizes or chargers).`,
    }),
  fromInlet: (lang: Lang): string =>
    t(lang, {
      ar: 'من بيانات منفذ الشحن المسجلة لهذا السوق.',
      en: "From this market's recorded charging-inlet data.",
    }),
  noDcInlet: (lang: Lang): string =>
    t(lang, {
      ar: 'لا يوجد منفذ شحن سريع DC مسجل لهذه الفئة في هذا السوق.',
      en: 'No DC fast-charging inlet is recorded for this trim in this market.',
    }),
  foreignEstimate: (lang: Lang): string =>
    t(lang, {
      ar: 'تقدير بعملة أخرى، وليس سعرًا محليًا رسميًا.',
      en: 'Estimate in another currency, not an official local price.',
    }),
  summary: (lang: Lang): string =>
    t(lang, {
      ar: 'عدد الصفوف التي تفوقت فيها كل سيارة ليس حكمًا نهائيًا: الصفوف غير القابلة للمقارنة أو الناقصة لا تُحتسب، ولكل مستخدم أولوياته. استخدم الترشيح حسب الاستخدام لترتيب موزون.',
      en: 'Rows won per car is not a verdict: rows that are not comparable or have missing data are not counted, and priorities differ. Use the usage-based recommendation for a weighted ranking.',
    }),
};

/** Human label of a comparability status (for clients that want a chip text). */
export const COMPARABILITY_LABELS: Record<Comparability, Bi> = {
  comparable: { ar: 'قابل للمقارنة', en: 'Comparable' },
  not_comparable_cycles: { ar: 'دورات قياس مختلفة', en: 'Different test cycles' },
  not_comparable_soc_window: { ar: 'نطاقات شحن مختلفة', en: 'Different charge windows' },
  not_comparable_conditions: { ar: 'ظروف قياس مختلفة', en: 'Different test conditions' },
  missing_data: { ar: 'بيانات ناقصة', en: 'Missing data' },
  different_currency: { ar: 'عملات مختلفة', en: 'Different currencies' },
  not_applicable: { ar: 'لا ينطبق', en: 'Not applicable' },
};
