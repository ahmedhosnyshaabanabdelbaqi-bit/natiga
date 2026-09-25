/** Bilingual texts of the recommendation engine (reasons, weights, decisions). */
import type { Factor, Lang, NoDecisionReason } from './types';

interface Bi {
  ar: string;
  en: string;
}
export const tt = (lang: Lang, b: Bi): string => b[lang];

/** Latin digits with grouping in both languages (the app may re-format from `params`). */
export function fmt(n: number, digits = 1): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n);
}

export const FACTOR_LABELS: Record<Factor, Bi> = {
  price: { ar: 'السعر', en: 'Price' },
  range: { ar: 'المدى الكهربائي', en: 'Electric range' },
  dcCharging: { ar: 'الشحن السريع DC', en: 'DC fast charging' },
  acCharging: { ar: 'الشحن المتردد AC', en: 'AC charging' },
  efficiency: { ar: 'كفاءة استهلاك الكهرباء', en: 'Energy efficiency' },
  space: { ar: 'مساحة الصندوق', en: 'Trunk space' },
  performance: { ar: 'التسارع', en: 'Acceleration' },
};

export const FACTOR_DESCRIPTIONS: Record<Factor, Bi> = {
  price: {
    ar: 'السعر الحالي في السوق بعملته المحلية (الأقل أفضل). لا تحويل للعملات.',
    en: 'Current local-currency price in the market (lower is better). No currency conversion.',
  },
  range: {
    ar: 'المدى الكهربائي بنفس دورة القياس لكل السيارات (الأعلى أفضل). لا تحويل بين الدورات.',
    en: 'Electric range on the same test cycle for every car (higher is better). Never converted between cycles.',
  },
  dcCharging: {
    ar: 'أقصى قدرة شحن سريع (ذروة، الأعلى أفضل). غياب منفذ DC المسجل يُحتسب صفرًا لأنه معلوم.',
    en: 'Peak DC fast-charging power (higher is better). A recorded absence of a DC inlet counts as 0 because it is known.',
  },
  acCharging: {
    ar: 'أقصى قدرة شحن متردد AC (الأعلى أفضل).',
    en: 'Maximum AC charging power (higher is better).',
  },
  efficiency: {
    ar: 'استهلاك الكهرباء بنفس الدورة ونمط القياس (الأقل أفضل).',
    en: 'Electricity consumption on the same cycle and mode (lower is better).',
  },
  space: {
    ar: 'سعة الصندوق باللتر (الأعلى أفضل).',
    en: 'Trunk volume in litres (higher is better).',
  },
  performance: {
    ar: 'زمن التسارع من 0 إلى 100 كم/س (الأقل أفضل).',
    en: '0–100 km/h time (lower is better).',
  },
};

export const WEIGHT_NOTES = {
  longTrips: {
    ar: 'رفعنا وزن المدى والشحن السريع لأنك تسافر لمسافات طويلة مرتين أو أكثر شهريًا.',
    en: 'Range and DC charging weigh more because you make two or more long trips a month.',
  },
  highDaily: {
    ar: 'رفعنا وزن المدى لأنك تقطع 100 كم أو أكثر يوميًا.',
    en: 'Range weighs more because you drive 100 km or more a day.',
  },
  efficiencyDaily: {
    ar: 'رفعنا وزن الكفاءة لأنك تقطع 60 كم أو أكثر يوميًا.',
    en: 'Efficiency weighs more because you drive 60 km or more a day.',
  },
  noHome: {
    ar: 'رفعنا وزن الشحن السريع لأنك لا تستطيع الشحن في المنزل.',
    en: 'DC charging weighs more because you cannot charge at home.',
  },
  home: {
    ar: 'للشحن المنزلي وزن أكبر لأنك تستطيع الشحن في المنزل.',
    en: 'AC charging weighs more because you can charge at home.',
  },
  user: {
    ar: 'استخدمنا الأوزان التي حددتها بدل الأوزان الافتراضية لهذه العوامل.',
    en: 'Your own weights replaced the defaults for those factors.',
  },
} satisfies Record<string, Bi>;

export const DECISION_MESSAGES: Record<NoDecisionReason | 'decisive', Bi> = {
  decisive: {
    ar: 'الترشيح الأول يتقدم بوضوح وفق أوزانك وبيانات قابلة للمقارنة.',
    en: 'The top pick leads clearly with your weights and comparable data.',
  },
  no_candidates: {
    ar: 'لا توجد سيارات مطروحة في هذا السوق تطابق ميزانيتك وعدد المقاعد ونوع الهيكل.',
    en: 'No car listed in this market matches your budget, seats and body type.',
  },
  no_comparable_candidates: {
    ar: 'لا يوجد حكم حاسم: السيارات المطابقة تنقصها بيانات لازمة أو بياناتها غير قابلة للمقارنة. راجع البيانات الناقصة أو اجعل وزن العامل الناقص صفرًا.',
    en: 'No decisive recommendation: the matching cars lack needed data or their data is not comparable. See the missing data, or set the weight of a missing factor to 0.',
  },
  fewer_than_two_comparable: {
    ar: 'لا يوجد حكم حاسم: سيارة واحدة فقط لديها بيانات كاملة قابلة للمقارنة، فلا يمكن مقارنتها بغيرها.',
    en: 'No decisive recommendation: only one car has complete, comparable data, so there is nothing to compare it with.',
  },
  scores_too_close: {
    ar: 'لا يوجد حكم حاسم: النتائج متقاربة جدًا، والاختيار يعتمد على أولوياتك. قارن السيارات الأولى تفصيليًا.',
    en: 'No decisive recommendation: the scores are too close and the choice depends on your priorities. Compare the top cars in detail.',
  },
};

export const NOT_RANKED_TEXT = {
  missing_data: {
    ar: 'لم تُرتّب لأن بيانات لازمة غير متوفرة (لا نعتبر الناقص صفرًا).',
    en: 'Not ranked because some needed data is not available (missing values are never treated as 0).',
  },
  not_comparable: {
    ar: 'لم تُرتّب لأن بياناتها مقاسة بدورة أو نمط مختلف عن بقية السيارات.',
    en: 'Not ranked because its data was measured on a different cycle or mode than the other cars.',
  },
  price_not_available: {
    ar: 'لم تُرتّب لأن سعرها المحلي الحالي غير متوفر، فلا يمكن التأكد من ملاءمتها لميزانيتك.',
    en: 'Not ranked because its current local price is not available, so the budget cannot be checked.',
  },
  seats_not_available: {
    ar: 'لم تُرتّب لأن عدد المقاعد غير متوفر.',
    en: 'Not ranked because the number of seats is not available.',
  },
} satisfies Record<string, Bi>;

export const MISSING_DETAIL = {
  missing: { ar: 'غير متوفر', en: 'Not available' },
  cycle_mismatch: (cycle: string): Bi => ({
    ar: `متوفر بدورة قياس أخرى غير ${cycle}`,
    en: `Only available on another test cycle than ${cycle}`,
  }),
  mode_mismatch: (mode: string): Bi => ({
    ar: `متوفر بنمط قياس آخر غير ${mode}`,
    en: `Only available in another measuring mode than ${mode}`,
  }),
};

export const SUGGESTION = (label: string): Bi => ({
  ar: `بعض السيارات تنقصها بيانات «${label}». اجعل وزن هذا العامل صفرًا لترتيبها دونه.`,
  en: `Some cars lack “${label}” data. Set this factor's weight to 0 to rank them without it.`,
});

export const NOTES = {
  cycles: {
    ar: 'أرقام المدى والاستهلاك من دورات قياس رسمية؛ المدى الفعلي عادة أقل ويتأثر بالسرعة والحرارة.',
    en: 'Range and consumption figures come from official test cycles; real-world range is usually lower and depends on speed and temperature.',
  },
  prices: {
    ar: 'نستخدم السعر المحلي الحالي فقط، ولا نحوّل العملات.',
    en: 'Only current local-currency prices are used; currencies are never converted.',
  },
} satisfies Record<string, Bi>;
