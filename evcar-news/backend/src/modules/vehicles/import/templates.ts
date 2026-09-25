/**
 * CSV templates of the catalog import / export (one per data kind). Column
 * names are stable snake_case; `required` columns must be present in the
 * header AND filled; other columns may be omitted or left empty (empty =
 * keep the stored value on update, default on create).
 */
export const IMPORT_TYPES = [
  'variants',
  'variant_markets',
  'specs',
  'ranges',
  'consumption',
  'charging_times',
  'prices',
] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export interface ColumnDef {
  name: string;
  required: boolean;
  descriptionEn: string;
  descriptionAr: string;
  /** Allowed values (enums). */
  allowed?: readonly string[];
  /** Format example (never a real fact). */
  example?: string;
}

export interface TemplateDef {
  type: ImportType;
  titleEn: string;
  titleAr: string;
  /** Natural key used for duplicate detection and idempotent upserts. */
  keyEn: string;
  keyAr: string;
  /** Extra permission needed besides imports.run + vehicles.write. */
  extraPermission?: string;
  columns: ColumnDef[];
}

const c = (
  name: string,
  required: boolean,
  descriptionEn: string,
  descriptionAr: string,
  extra: Partial<ColumnDef> = {},
): ColumnDef => ({ name, required, descriptionEn, descriptionAr, ...extra });

const RELIABILITY = ['verified', 'manufacturer_claim', 'estimated', 'unverified', 'disputed'];
const CYCLES = ['WLTP', 'EPA', 'CLTC', 'NEDC', 'OTHER'];

/** Provenance columns shared by data templates. */
const SOURCE_COLUMNS: ColumnDef[] = [
  c('source_id', false, 'Existing source id (wins over the columns below).', 'معرّف مصدر موجود.'),
  c(
    'source_url',
    false,
    'Source URL (an existing source with this URL is reused).',
    'رابط المصدر.',
  ),
  c(
    'source_title',
    false,
    'Title of a NEW source (with source_type; needs sources.write).',
    'عنوان مصدر جديد.',
  ),
  c('source_type', false, 'Type of a new source.', 'نوع المصدر الجديد.', {
    allowed: [
      'manufacturer',
      'official_document',
      'press_release',
      'homologation',
      'independent_test',
      'dealer',
      'media_review',
      'third_party_database',
      'user_submitted',
      'other',
    ],
  }),
  c(
    'reliability',
    false,
    'Reliability (verified needs specs.verify + a source).',
    'درجة الموثوقية.',
    {
      allowed: RELIABILITY,
    },
  ),
  c(
    'verified_at',
    false,
    'Verification timestamp (ISO 8601; needs specs.verify).',
    'تاريخ التحقق.',
    {
      example: '2026-01-31T00:00:00Z',
    },
  ),
];

const VARIANT_SLUG = c(
  'variant_slug',
  true,
  'Slug of an existing variant.',
  'المعرّف النصي للفئة.',
  {
    example: 'brand-model-2025-trim-bev',
  },
);

export const TEMPLATES: Record<ImportType, TemplateDef> = {
  variants: {
    type: 'variants',
    titleEn: 'Catalog: brand → model → generation → year → variant',
    titleAr: 'الدليل: ماركة ← موديل ← جيل ← سنة ← فئة',
    keyEn: 'variant_slug, or model + generation + year + powertrain + variant_name_en',
    keyAr: 'variant_slug أو الموديل + الجيل + السنة + نوع الدفع + الاسم الإنجليزي للفئة',
    columns: [
      c('brand_slug', true, 'Brand slug (created as draft when missing).', 'معرّف الماركة.', {
        example: 'brand',
      }),
      c('brand_name_en', false, 'Needed to create a brand.', 'اسم الماركة بالإنجليزية (للإنشاء).'),
      c('brand_name_ar', false, 'Needed to create a brand.', 'اسم الماركة بالعربية (للإنشاء).'),
      c('model_slug', true, 'Model slug (created as draft when missing).', 'معرّف الموديل.', {
        example: 'brand-model',
      }),
      c('model_name_en', false, 'Needed to create a model.', 'اسم الموديل بالإنجليزية (للإنشاء).'),
      c('model_name_ar', false, 'Needed to create a model.', 'اسم الموديل بالعربية (للإنشاء).'),
      c('body_type', false, 'Model body type.', 'نوع الهيكل.', {
        allowed: [
          'sedan',
          'hatchback',
          'suv',
          'crossover',
          'coupe',
          'convertible',
          'wagon',
          'pickup',
          'van',
          'mpv',
          'other',
        ],
      }),
      c('generation_slug', true, 'Generation slug within the model.', 'معرّف الجيل.', {
        example: 'gen-1',
      }),
      c(
        'generation_name_en',
        false,
        'Needed to create a generation.',
        'اسم الجيل بالإنجليزية (للإنشاء).',
      ),
      c(
        'generation_name_ar',
        false,
        'Needed to create a generation.',
        'اسم الجيل بالعربية (للإنشاء).',
      ),
      c('generation_code', false, 'Platform / generation code.', 'رمز الجيل.'),
      c('generation_start_year', false, 'First year.', 'سنة البداية.', { example: '2024' }),
      c('generation_end_year', false, 'Last year.', 'سنة النهاية.'),
      c('year', true, 'Model year.', 'سنة الموديل.', { example: '2025' }),
      c(
        'variant_slug',
        false,
        'Variant slug (generated when empty).',
        'معرّف الفئة (يُولد تلقائيًا).',
      ),
      c('variant_name_en', true, 'Trim name (English).', 'اسم الفئة بالإنجليزية.'),
      c('variant_name_ar', true, 'Trim name (Arabic).', 'اسم الفئة بالعربية.'),
      c('powertrain', true, 'One powertrain per variant.', 'نوع منظومة الدفع.', {
        allowed: ['BEV', 'PHEV', 'EREV', 'HEV'],
      }),
      c('trim_code', false, 'Manufacturer trim code.', 'رمز الفئة.'),
      c('drive', false, 'Drive type.', 'نوع الدفع.', { allowed: ['fwd', 'rwd', 'awd'] }),
      c('seats', false, 'Seats (1–12).', 'عدد المقاعد.'),
      c('doors', false, 'Doors (1–6).', 'عدد الأبواب.'),
      c('variant_body_type', false, 'Overrides the model body type.', 'نوع هيكل خاص بالفئة.'),
      c('sort_order', false, 'Display order within the year.', 'ترتيب العرض.'),
    ],
  },
  variant_markets: {
    type: 'variant_markets',
    titleEn: 'Availability and local names per market',
    titleAr: 'التوافر والأسماء المحلية لكل سوق',
    keyEn: 'variant_slug + market',
    keyAr: 'variant_slug + السوق',
    columns: [
      VARIANT_SLUG,
      c('market', true, 'Market code.', 'رمز السوق.', { example: 'EG' }),
      c('availability', true, 'Availability.', 'حالة التوافر.', {
        allowed: ['available', 'coming_soon', 'discontinued', 'not_available', 'unknown'],
      }),
      c('local_name_en', false, 'Local trim name (English).', 'الاسم المحلي بالإنجليزية.'),
      c('local_name_ar', false, 'Local trim name (Arabic).', 'الاسم المحلي بالعربية.'),
      c('drive_side', false, 'Steering side.', 'جهة المقود.', { allowed: ['lhd', 'rhd'] }),
      c('launch_date', false, 'YYYY-MM-DD', 'تاريخ الإطلاق.'),
      c('discontinued_at', false, 'YYYY-MM-DD', 'تاريخ التوقف.'),
      c('source_id', false, 'Existing source id.', 'معرّف المصدر.'),
      c('source_url', false, 'Source URL.', 'رابط المصدر.'),
      c('source_title', false, 'Title of a new source.', 'عنوان مصدر جديد.'),
      c('source_type', false, 'Type of a new source.', 'نوع المصدر الجديد.'),
      c('verified_at', false, 'Needs specs.verify.', 'تاريخ التحقق.'),
      c('notes', false, 'Notes.', 'ملاحظات.'),
    ],
  },
  specs: {
    type: 'specs',
    titleEn: 'Specification values (canonical units, original value kept)',
    titleAr: 'قيم المواصفات (وحدات موحدة مع حفظ القيمة الأصلية)',
    keyEn: 'variant_slug + spec_key + market',
    keyAr: 'variant_slug + مفتاح المواصفة + السوق',
    columns: [
      VARIANT_SLUG,
      c('spec_key', true, 'Key from /admin/spec-definitions.', 'مفتاح المواصفة.', {
        example: 'battery.usable_kwh',
      }),
      c('market', false, 'Empty = all markets.', 'فارغ = كل الأسواق.'),
      c('value', true, 'Number, text or true/false.', 'القيمة.', { example: '75' }),
      c(
        'unit',
        false,
        'Unit of value when not canonical (e.g. mi, Wh, PS).',
        'وحدة القيمة إن لم تكن الموحدة.',
      ),
      c('original_value', false, 'Value as published.', 'القيمة كما نُشرت.'),
      c('original_unit', false, 'Unit as published.', 'الوحدة كما نُشرت.'),
      ...SOURCE_COLUMNS,
      c('notes', false, 'Notes.', 'ملاحظات.'),
    ],
  },
  ranges: {
    type: 'ranges',
    titleEn: 'Range per test cycle (never converted between cycles)',
    titleAr: 'المدى لكل دورة قياس (بلا تحويل بين الدورات)',
    keyEn: 'variant_slug + market + cycle + cycle_note + range_type + wheel_size_inch',
    keyAr: 'variant_slug + السوق + الدورة + اسم الدورة + نوع المدى + مقاس العجلات',
    columns: [
      VARIANT_SLUG,
      c('market', false, 'Empty = all markets.', 'فارغ = كل الأسواق.'),
      c('cycle', true, 'Test cycle.', 'دورة القياس.', { allowed: CYCLES }),
      c('cycle_note', false, 'Required for OTHER.', 'مطلوب مع OTHER.'),
      c('range_type', true, 'electric, or total (hybrids).', 'كهربائي أو إجمالي.', {
        allowed: ['electric', 'total'],
      }),
      c('value', true, 'Range.', 'المدى.', { example: '520' }),
      c('unit', false, 'km (default) or mi.', 'km أو mi.'),
      c('wheel_size_inch', false, 'Wheel size.', 'مقاس العجلات.'),
      c('conditions', false, 'Test conditions.', 'ظروف القياس.'),
      c('original_value', false, 'Value as published.', 'القيمة كما نُشرت.'),
      c('original_unit', false, 'Unit as published.', 'الوحدة كما نُشرت.'),
      ...SOURCE_COLUMNS,
    ],
  },
  consumption: {
    type: 'consumption',
    titleEn: 'Energy / fuel consumption per test cycle',
    titleAr: 'استهلاك الطاقة أو الوقود لكل دورة قياس',
    keyEn: 'variant_slug + market + cycle + cycle_note + kind + mode',
    keyAr: 'variant_slug + السوق + الدورة + النوع + النمط',
    columns: [
      VARIANT_SLUG,
      c('market', false, 'Empty = all markets.', 'فارغ = كل الأسواق.'),
      c('cycle', true, 'Test cycle.', 'دورة القياس.', { allowed: CYCLES }),
      c('cycle_note', false, 'Required for OTHER.', 'مطلوب مع OTHER.'),
      c('kind', true, 'electricity or fuel.', 'كهرباء أو وقود.', {
        allowed: ['electricity', 'fuel'],
      }),
      c('mode', false, 'Hybrid operating mode.', 'نمط التشغيل للهجينة.', {
        allowed: ['combined', 'charge_depleting', 'charge_sustaining', 'weighted'],
      }),
      c('value', true, 'Consumption.', 'الاستهلاك.', { example: '16.5' }),
      c(
        'unit',
        false,
        'Default Wh/km or L/100km (also kWh/100km, mi/kWh, km/L, mpg(US)…).',
        'الوحدة.',
      ),
      c('conditions', false, 'Test conditions.', 'ظروف القياس.'),
      c('original_value', false, 'Value as published.', 'القيمة كما نُشرت.'),
      c('original_unit', false, 'Unit as published.', 'الوحدة كما نُشرت.'),
      ...SOURCE_COLUMNS,
    ],
  },
  charging_times: {
    type: 'charging_times',
    titleEn: 'Charging time for a SoC window under a charger condition',
    titleAr: 'زمن الشحن بين نسبتين مع شرط الشاحن',
    keyEn: 'variant_slug + current_type + from_soc + to_soc + charger_power_kw + conditions',
    keyAr: 'variant_slug + نوع التيار + نسبة البداية والنهاية + قدرة الشاحن + الظروف',
    columns: [
      VARIANT_SLUG,
      c('current_type', true, 'AC or DC.', 'AC أو DC.', { allowed: ['AC', 'DC'] }),
      c('from_soc', true, '0–100.', 'نسبة البداية.', { example: '10' }),
      c('to_soc', true, '0–100, above from_soc.', 'نسبة النهاية.', { example: '80' }),
      c('duration', true, 'Duration.', 'المدة.', { example: '28' }),
      c('duration_unit', false, 'min (default), h or s.', 'وحدة المدة.', {
        allowed: ['min', 'h', 's'],
      }),
      c(
        'charger_power_kw',
        false,
        'Charger rating; required unless conditions is filled.',
        'قدرة الشاحن.',
      ),
      c('peak_power_kw', false, 'Peak power.', 'القدرة القصوى.'),
      c('average_power_kw', false, 'Average power (≤ peak).', 'متوسط القدرة.'),
      c('onboard_charger_limit_kw', false, 'AC on-board charger limit.', 'حد الشاحن المدمج.'),
      c('conditions', false, 'Test conditions.', 'ظروف القياس.'),
      ...SOURCE_COLUMNS,
    ],
  },
  prices: {
    type: 'prices',
    titleEn: 'Price history (type, currency, effective date, source) — never converted',
    titleAr: 'تاريخ الأسعار (النوع والعملة وتاريخ السريان والمصدر) — بلا تحويل عملات',
    keyEn: 'variant_slug + market + price_type + currency + effective_from',
    keyAr: 'variant_slug + السوق + نوع السعر + العملة + تاريخ السريان',
    extraPermission: 'prices.write',
    columns: [
      VARIANT_SLUG,
      c('market', true, 'Market code (the variant needs a market row).', 'رمز السوق.', {
        example: 'EG',
      }),
      c('amount', true, 'Decimal amount.', 'المبلغ.', { example: '1850000.00' }),
      c('currency', true, 'Official / dealer prices: the market currency.', 'العملة.', {
        example: 'EGP',
      }),
      c('price_type', true, 'Price type.', 'نوع السعر.', {
        allowed: ['official_msrp', 'dealer', 'market_estimate'],
      }),
      c('effective_from', true, 'YYYY-MM-DD', 'تاريخ بداية السريان.'),
      c('effective_to', false, 'YYYY-MM-DD', 'تاريخ نهاية السريان.'),
      ...SOURCE_COLUMNS,
      c('notes', false, 'Notes.', 'ملاحظات.'),
    ],
  },
};

export function isImportType(v: string): v is ImportType {
  return (IMPORT_TYPES as readonly string[]).includes(v);
}
