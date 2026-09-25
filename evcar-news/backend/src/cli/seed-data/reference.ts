/**
 * Reference data (NOT sample content): currencies, markets, connector types,
 * default app settings, spec definitions, default news categories and
 * search aliases.
 * Values here are generic reference facts or product defaults — no news,
 * prices, stations or vehicle data.
 */

export const CURRENCIES = [
  {
    code: 'EGP',
    nameAr: 'جنيه مصري',
    nameEn: 'Egyptian Pound',
    symbolAr: 'ج.م',
    symbolEn: 'E£',
    decimals: 2,
  },
  {
    code: 'SAR',
    nameAr: 'ريال سعودي',
    nameEn: 'Saudi Riyal',
    symbolAr: 'ر.س',
    symbolEn: 'SAR',
    decimals: 2,
  },
  {
    code: 'AED',
    nameAr: 'درهم إماراتي',
    nameEn: 'UAE Dirham',
    symbolAr: 'د.إ',
    symbolEn: 'AED',
    decimals: 2,
  },
  // Source currencies for foreign prices (shown only as labelled conversions).
  {
    code: 'USD',
    nameAr: 'دولار أمريكي',
    nameEn: 'US Dollar',
    symbolAr: '$',
    symbolEn: '$',
    decimals: 2,
  },
  { code: 'EUR', nameAr: 'يورو', nameEn: 'Euro', symbolAr: '€', symbolEn: '€', decimals: 2 },
  {
    code: 'CNY',
    nameAr: 'يوان صيني',
    nameEn: 'Chinese Yuan',
    symbolAr: '¥',
    symbolEn: '¥',
    decimals: 2,
  },
] as const;

/** Launch market EG (default) plus SA and AE. More can be added from admin. */
export const MARKETS = [
  {
    code: 'EG',
    nameAr: 'مصر',
    nameEn: 'Egypt',
    currencyCode: 'EGP',
    timezone: 'Africa/Cairo',
    defaultLanguage: 'ar',
    sortOrder: 1,
  },
  {
    code: 'SA',
    nameAr: 'السعودية',
    nameEn: 'Saudi Arabia',
    currencyCode: 'SAR',
    timezone: 'Asia/Riyadh',
    defaultLanguage: 'ar',
    sortOrder: 2,
  },
  {
    code: 'AE',
    nameAr: 'الإمارات',
    nameEn: 'United Arab Emirates',
    currencyCode: 'AED',
    timezone: 'Asia/Dubai',
    defaultLanguage: 'ar',
    sortOrder: 3,
  },
] as const;

/**
 * Connector standards. `typicalMax*Kw` are informational typical values of
 * the standard (NOT a statement about any station); every connector row
 * stores its own max_power_kw. `aliases` help map provider names (e.g. Open
 * Charge Map connection types) and must be verified by the stations importer.
 */
export const CONNECTOR_TYPES = [
  {
    code: 'type1',
    nameEn: 'Type 1 (J1772)',
    nameAr: 'النوع 1 (J1772)',
    supportsAc: true,
    supportsDc: false,
    typicalMaxAcKw: '7.4',
    typicalMaxDcKw: null,
    standard: 'SAE J1772 / IEC 62196-2 Type 1',
    aliases: ['Type 1 (J1772)', 'J1772', 'SAE J1772'],
    iconKey: 'type1',
    sortOrder: 60,
  },
  {
    code: 'type2',
    nameEn: 'Type 2 (Mennekes)',
    nameAr: 'النوع 2 (منيكس)',
    supportsAc: true,
    supportsDc: false,
    typicalMaxAcKw: '22',
    typicalMaxDcKw: null,
    standard: 'IEC 62196-2 Type 2',
    aliases: [
      'Type 2 (Socket Only)',
      'Type 2 (Tethered Connector)',
      'Mennekes (Type 2)',
      'IEC 62196-2 Type 2',
    ],
    iconKey: 'type2',
    sortOrder: 10,
  },
  {
    code: 'ccs2',
    nameEn: 'CCS2 (Combo 2)',
    nameAr: 'CCS2 (كومبو 2)',
    supportsAc: false,
    supportsDc: true,
    typicalMaxAcKw: null,
    typicalMaxDcKw: '350',
    standard: 'IEC 62196-3 Combo 2',
    aliases: ['CCS (Type 2)', 'Combo 2', 'CCS2'],
    iconKey: 'ccs2',
    sortOrder: 20,
  },
  {
    code: 'ccs1',
    nameEn: 'CCS1 (Combo 1)',
    nameAr: 'CCS1 (كومبو 1)',
    supportsAc: false,
    supportsDc: true,
    typicalMaxAcKw: null,
    typicalMaxDcKw: '350',
    standard: 'SAE J1772 Combo 1',
    aliases: ['CCS (Type 1)', 'Combo 1', 'SAE Combo', 'CCS1'],
    iconKey: 'ccs1',
    sortOrder: 50,
  },
  {
    code: 'chademo',
    nameEn: 'CHAdeMO',
    nameAr: 'تشاديمو (CHAdeMO)',
    supportsAc: false,
    supportsDc: true,
    typicalMaxAcKw: null,
    typicalMaxDcKw: '62.5',
    standard: 'CHAdeMO / IEC 62196-3 AA',
    aliases: ['CHAdeMO'],
    iconKey: 'chademo',
    sortOrder: 40,
  },
  {
    code: 'nacs',
    nameEn: 'NACS (SAE J3400)',
    nameAr: 'NACS (تسلا / SAE J3400)',
    supportsAc: true,
    supportsDc: true,
    typicalMaxAcKw: '11.5',
    typicalMaxDcKw: '250',
    standard: 'SAE J3400',
    aliases: ['NACS / Tesla Supercharger', 'Tesla (Model S/X)', 'NACS', 'SAE J3400'],
    iconKey: 'nacs',
    sortOrder: 70,
  },
  {
    code: 'gbt_ac',
    nameEn: 'GB/T AC',
    nameAr: 'GB/T تيار متردد',
    supportsAc: true,
    supportsDc: false,
    typicalMaxAcKw: '7',
    typicalMaxDcKw: null,
    standard: 'GB/T 20234.2',
    aliases: [
      'GB-T AC - GB/T 20234.2 (Socket)',
      'GB-T AC - GB/T 20234.2 (Tethered Cable)',
      'GB/T AC',
    ],
    iconKey: 'gbt_ac',
    sortOrder: 30,
  },
  {
    code: 'gbt_dc',
    nameEn: 'GB/T DC',
    nameAr: 'GB/T تيار مستمر',
    supportsAc: false,
    supportsDc: true,
    typicalMaxAcKw: null,
    typicalMaxDcKw: '250',
    standard: 'GB/T 20234.3',
    aliases: ['GB-T DC - GB/T 20234.3', 'GB/T DC'],
    iconKey: 'gbt_dc',
    sortOrder: 35,
  },
  {
    code: 'chaoji',
    nameEn: 'ChaoJi (CHAdeMO 3.0)',
    nameAr: 'تشاوجي (CHAdeMO 3.0)',
    supportsAc: false,
    supportsDc: true,
    typicalMaxAcKw: null,
    typicalMaxDcKw: null,
    standard: 'CHAdeMO 3.0 / GB/T 20234.4 (ChaoJi)',
    aliases: ['ChaoJi', 'CHAdeMO 3.0'],
    iconKey: 'chaoji',
    sortOrder: 45,
  },
  // Domestic / industrial sockets: slow AC charging with the car's portable
  // charger (EVSE cable). Listed because providers report them; the
  // compatibility filter must still rely on the variant's verified inlets
  // and never recommend an unverified adapter (REQUIREMENTS §11).
  {
    code: 'schuko',
    nameEn: 'Schuko (CEE 7/4, Type F)',
    nameAr: 'مقبس منزلي شوكو (CEE 7/4)',
    supportsAc: true,
    supportsDc: false,
    typicalMaxAcKw: '3.7',
    typicalMaxDcKw: null,
    standard: 'CEE 7/3 socket, CEE 7/4 plug (Type F)',
    aliases: ['CEE 7/4 - Schuko - Type F', 'Schuko', 'CEE 7/4'],
    iconKey: 'schuko',
    sortOrder: 80,
  },
  {
    code: 'bs1363',
    nameEn: 'BS 1363 (Type G, 13 A)',
    nameAr: 'مقبس منزلي BS 1363 (النوع G)',
    supportsAc: true,
    supportsDc: false,
    typicalMaxAcKw: '3',
    typicalMaxDcKw: null,
    standard: 'BS 1363 (Type G)',
    aliases: ['BS1363 3 Pin 13 Amp', 'BS 1363', 'Type G'],
    iconKey: 'bs1363',
    sortOrder: 85,
  },
  {
    code: 'iec60309',
    nameEn: 'IEC 60309 (industrial / CEE)',
    nameAr: 'مقبس صناعي IEC 60309 (CEE)',
    supportsAc: true,
    supportsDc: false,
    typicalMaxAcKw: '22',
    typicalMaxDcKw: null,
    standard: 'IEC 60309-2 (blue 1-phase / red 3-phase)',
    aliases: ['IEC 60309 3-pin', 'IEC 60309 5-pin', 'CEE 16A', 'CEE 32A', 'Commando'],
    iconKey: 'iec60309',
    sortOrder: 90,
  },
] as const;

/**
 * Encyclopedia categories (REQUIREMENTS §15: vehicle types, connectors,
 * batteries, range standards, home and fast charging, warranty, used-EV
 * inspection). Created when missing, never overwritten (admins edit names /
 * order / deactivate); `isSystem` rows come back if deleted.
 */
export const ENCYCLOPEDIA_CATEGORIES: {
  key: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  iconKey: string;
  sortOrder: number;
}[] = [
  {
    key: 'vehicle_types',
    nameAr: 'أنواع السيارات الكهربائية',
    nameEn: 'Types of electrified cars',
    descriptionAr: 'الفرق بين الكهربائية بالكامل والهجينة القابلة للشحن وممددة المدى والهجينة.',
    descriptionEn: 'BEV, PHEV, EREV and HEV explained.',
    iconKey: 'car',
    sortOrder: 10,
  },
  {
    key: 'connectors',
    nameAr: 'منافذ وموصلات الشحن',
    nameEn: 'Charging connectors',
    descriptionAr: 'أنواع الموصلات والفرق بين الشحن المتردد والمستمر.',
    descriptionEn: 'Plug standards and AC vs DC charging.',
    iconKey: 'plug',
    sortOrder: 20,
  },
  {
    key: 'batteries',
    nameAr: 'البطاريات',
    nameEn: 'Batteries',
    descriptionAr: 'السعة الإجمالية والقابلة للاستخدام والكيمياء والعناية بالبطارية.',
    descriptionEn: 'Gross vs usable capacity, chemistry and battery care.',
    iconKey: 'battery',
    sortOrder: 30,
  },
  {
    key: 'range_cycles',
    nameAr: 'معايير قياس المدى',
    nameEn: 'Range test cycles',
    descriptionAr: 'WLTP وEPA وCLTC وNEDC ولماذا لا تُقارن أرقامها مباشرة.',
    descriptionEn: 'WLTP, EPA, CLTC and NEDC and why their numbers are not comparable.',
    iconKey: 'route',
    sortOrder: 40,
  },
  {
    key: 'home_charging',
    nameAr: 'الشحن المنزلي',
    nameEn: 'Home charging',
    descriptionAr: 'الشواحن المنزلية والتركيب الآمن بواسطة فني مختص.',
    descriptionEn: 'Home chargers and safe installation by a qualified electrician.',
    iconKey: 'home',
    sortOrder: 50,
  },
  {
    key: 'fast_charging',
    nameAr: 'الشحن السريع',
    nameEn: 'Fast charging',
    descriptionAr: 'منحنيات الشحن والقدرة القصوى مقابل المتوسطة وأزمنة الشحن.',
    descriptionEn: 'Charging curves, peak vs average power and charging times.',
    iconKey: 'bolt',
    sortOrder: 60,
  },
  {
    key: 'warranty',
    nameAr: 'الضمان',
    nameEn: 'Warranty',
    descriptionAr: 'ضمان السيارة والبطارية وما يجب التحقق منه.',
    descriptionEn: 'Vehicle and battery warranty and what to check.',
    iconKey: 'shield',
    sortOrder: 70,
  },
  {
    key: 'used_ev_inspection',
    nameAr: 'فحص السيارة الكهربائية المستعملة',
    nameEn: 'Inspecting a used EV',
    descriptionAr: 'ما يجب فحصه قبل شراء سيارة كهربائية مستعملة.',
    descriptionEn: 'What to check before buying a used electric car.',
    iconKey: 'search',
    sortOrder: 80,
  },
  {
    key: 'other',
    nameAr: 'موضوعات أخرى',
    nameEn: 'Other topics',
    descriptionAr: 'موضوعات عامة للمبتدئين.',
    descriptionEn: 'General beginner topics.',
    iconKey: 'info',
    sortOrder: 999,
  },
];

export interface ReportReasonDef {
  scope: 'station' | 'content';
  code: string;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  descriptionEn: string;
  requiresDetails: boolean;
  sortOrder: number;
}

/**
 * Labels of the report vocabularies (station_report_type and
 * content_report_reason enums). Created when missing, never overwritten.
 */
export const REPORT_REASONS: ReportReasonDef[] = [
  {
    scope: 'station',
    code: 'not_working',
    labelAr: 'لا يعمل',
    labelEn: 'Not working',
    descriptionAr: 'الشاحن أو أحد المنافذ لا يعمل.',
    descriptionEn: 'The charger or one of its connectors does not work.',
    requiresDetails: false,
    sortOrder: 10,
  },
  {
    scope: 'station',
    code: 'wrong_location',
    labelAr: 'الموقع غير صحيح',
    labelEn: 'Wrong location',
    descriptionAr: 'مكان المحطة على الخريطة أو عنوانها غير صحيح.',
    descriptionEn: 'The map position or the address is wrong.',
    requiresDetails: false,
    sortOrder: 20,
  },
  {
    scope: 'station',
    code: 'different_connector',
    labelAr: 'الموصل مختلف',
    labelEn: 'Different connector',
    descriptionAr: 'الموصل الموجود فعليًا يختلف عن المذكور.',
    descriptionEn: 'The connector on site differs from the listed one.',
    requiresDetails: false,
    sortOrder: 30,
  },
  {
    scope: 'station',
    code: 'price_changed',
    labelAr: 'السعر تغيّر',
    labelEn: 'Price changed',
    descriptionAr: 'التعرفة المعروضة لم تعد صحيحة.',
    descriptionEn: 'The listed tariff is no longer correct.',
    requiresDetails: false,
    sortOrder: 40,
  },
  {
    scope: 'station',
    code: 'access_restricted',
    labelAr: 'الدخول مقيّد',
    labelEn: 'Access restricted',
    descriptionAr: 'المحطة غير متاحة للعامة أو تحتاج تصريحًا أو عضوية.',
    descriptionEn: 'Not open to the public, or needs a permit or membership.',
    requiresDetails: false,
    sortOrder: 50,
  },
  {
    scope: 'station',
    code: 'other',
    labelAr: 'مشكلة أخرى',
    labelEn: 'Other problem',
    descriptionAr: 'اكتب وصفًا للمشكلة.',
    descriptionEn: 'Describe the problem.',
    requiresDetails: true,
    sortOrder: 99,
  },
  {
    scope: 'content',
    code: 'spam',
    labelAr: 'رسائل مزعجة أو إعلان',
    labelEn: 'Spam or advertising',
    descriptionAr: 'محتوى دعائي أو متكرر.',
    descriptionEn: 'Promotional or repeated content.',
    requiresDetails: false,
    sortOrder: 10,
  },
  {
    scope: 'content',
    code: 'abuse',
    labelAr: 'إساءة أو كراهية',
    labelEn: 'Abuse or hate',
    descriptionAr: 'إهانة أو تحرش أو خطاب كراهية.',
    descriptionEn: 'Insults, harassment or hate speech.',
    requiresDetails: false,
    sortOrder: 20,
  },
  {
    scope: 'content',
    code: 'off_topic',
    labelAr: 'خارج الموضوع',
    labelEn: 'Off topic',
    descriptionAr: 'لا علاقة له بالموضوع.',
    descriptionEn: 'Not related to the topic.',
    requiresDetails: false,
    sortOrder: 30,
  },
  {
    scope: 'content',
    code: 'misinformation',
    labelAr: 'معلومات مضللة',
    labelEn: 'Misinformation',
    descriptionAr: 'معلومات خاطئة أو مضللة.',
    descriptionEn: 'False or misleading information.',
    requiresDetails: false,
    sortOrder: 40,
  },
  {
    scope: 'content',
    code: 'personal_data',
    labelAr: 'بيانات شخصية',
    labelEn: 'Personal data',
    descriptionAr: 'ينشر بيانات شخصية لشخص آخر.',
    descriptionEn: "Publishes someone's personal data.",
    requiresDetails: false,
    sortOrder: 50,
  },
  {
    scope: 'content',
    code: 'copyright',
    labelAr: 'حقوق ملكية',
    labelEn: 'Copyright',
    descriptionAr: 'يستخدم محتوى محميًا دون إذن.',
    descriptionEn: 'Uses protected content without permission.',
    requiresDetails: false,
    sortOrder: 60,
  },
  {
    scope: 'content',
    code: 'other',
    labelAr: 'سبب آخر',
    labelEn: 'Other reason',
    descriptionAr: 'اكتب سبب البلاغ.',
    descriptionEn: 'Describe the reason.',
    requiresDetails: true,
    sortOrder: 99,
  },
];

/**
 * Ad placements known to the apps. All DISABLED by default (ads are off
 * until an admin enables a placement with a labelled campaign). Map and
 * 360° views are never ad surfaces (enum ad_surface has no such value).
 */
export const AD_PLACEMENTS: {
  key: string;
  nameEn: string;
  nameAr: string;
  surface:
    | 'home'
    | 'article_list'
    | 'article_detail'
    | 'car_list'
    | 'car_detail'
    | 'station_list'
    | 'directory_list'
    | 'encyclopedia';
}[] = [
  {
    key: 'home.after_latest_news',
    nameEn: 'Home — after latest news',
    nameAr: 'الرئيسية — بعد آخر الأخبار',
    surface: 'home',
  },
  {
    key: 'articles.list_inline',
    nameEn: 'News list — inline',
    nameAr: 'قائمة الأخبار — ضمن القائمة',
    surface: 'article_list',
  },
  {
    key: 'article.after_body',
    nameEn: 'Article — after the text',
    nameAr: 'المقال — بعد النص',
    surface: 'article_detail',
  },
  {
    key: 'cars.list_inline',
    nameEn: 'Car list — inline',
    nameAr: 'قائمة السيارات — ضمن القائمة',
    surface: 'car_list',
  },
  {
    key: 'directory.list_inline',
    nameEn: 'Services directory — inline',
    nameAr: 'دليل الخدمات — ضمن القائمة',
    surface: 'directory_list',
  },
];

/**
 * Default app settings. Seeded only when the key does not exist yet, so
 * admin edits are never overwritten. `isPublic` keys feed GET /app-config.
 */
export const APP_SETTINGS: {
  key: string;
  isPublic: boolean;
  description: string;
  value: unknown;
}[] = [
  {
    key: 'branding',
    isPublic: true,
    description: 'App name, logo and brand colors (overridable from admin).',
    value: {
      appName: 'EV Car News',
      logoUrl: null,
      primaryColor: '#0A5CFF',
      accentColor: '#00C2E0',
    },
  },
  {
    key: 'defaults',
    isPublic: true,
    description: 'Default language and market; supported languages.',
    value: { defaultLanguage: 'ar', defaultMarket: 'EG', languages: ['ar', 'en'] },
  },
  {
    key: 'home.sections',
    isPublic: true,
    description: 'Home sections order and visibility.',
    value: [
      { key: 'top_story', enabled: true, order: 1 },
      { key: 'latest_news', enabled: true, order: 2 },
      { key: 'interior_tours', enabled: true, order: 3 },
      { key: 'new_cars', enabled: true, order: 4 },
      { key: 'featured_comparisons', enabled: true, order: 5 },
      { key: 'reviews', enabled: true, order: 6 },
      { key: 'nearby_stations', enabled: true, order: 7 },
      { key: 'charging_guides', enabled: true, order: 8 },
    ],
  },
  {
    key: 'features',
    isPublic: true,
    description:
      'Feature flags. A feature is only announced to the apps when its flag is on AND its module is implemented (IMPLEMENTED_FEATURES); features that depend on external services also need them configured. Everything starts off until it ships.',
    value: {
      news: false,
      cars: false,
      comparisons: false,
      interiorTours: false,
      stations: false,
      calculators: false,
      garage: false,
      favorites: false,
      chargingLogs: false,
      reminders: false,
      encyclopedia: false,
      notifications: false,
      community: false,
      tripPlanner: false,
      servicesDirectory: false,
      assistant: false,
      ads: false,
      exteriorSpin: false,
    },
  },
  {
    key: 'share',
    isPublic: true,
    description: 'Share link settings (canonical web base URL and path templates).',
    value: {
      baseUrl: 'https://evcar.news',
      paths: { article: '/n/{slug}', car: '/cars/{slug}', comparison: '/compare/{shareId}' },
      defaultImageUrl: null,
    },
  },
  {
    key: 'legal',
    isPublic: true,
    description: 'Legal page URLs (null until the pages exist).',
    value: { privacyUrl: null, termsUrl: null },
  },
  {
    key: 'map',
    isPublic: true,
    description:
      'Map tiles. The public OSM tile server has a strict usage policy; configure your own tile provider for production.',
    value: {
      tileUrlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    },
  },
  {
    key: 'app_links',
    isPublic: false,
    description: 'Android App Links / iOS Universal Links (served by the share module).',
    value: {
      androidPackage: 'news.evcar.app',
      androidSha256CertFingerprints: [],
      iosTeamId: null,
      iosBundleId: 'news.evcar.app',
    },
  },
];

type SpecDef = {
  key: string;
  group: string;
  dataType: 'number' | 'text' | 'boolean';
  unit?: string;
  betterDirection?: 'higher' | 'lower' | 'none';
  labelEn: string;
  labelAr: string;
  isKeySpec?: boolean;
  descriptionEn?: string;
};

/**
 * Spec keys with canonical units and "better" direction for comparisons.
 * NOT specs: range (range_measurements, with cycle), consumption
 * (consumption_measurements, with cycle — never compared across cycles),
 * charging times (charging_time_measurements, with SoC window and charger
 * power) and charging ports (variant_market_inlets, per market, linked to
 * connector_types). Battery capacity is context, not a "bigger wins" metric
 * (betterDirection none, REQUIREMENTS §7).
 */
export const SPEC_DEFINITIONS: SpecDef[] = [
  // battery
  {
    key: 'battery.gross_kwh',
    group: 'battery',
    dataType: 'number',
    unit: 'kWh',
    betterDirection: 'none',
    labelEn: 'Battery capacity (gross)',
    labelAr: 'سعة البطارية الإجمالية',
    isKeySpec: true,
  },
  {
    key: 'battery.usable_kwh',
    group: 'battery',
    dataType: 'number',
    unit: 'kWh',
    betterDirection: 'none',
    labelEn: 'Battery capacity (usable)',
    labelAr: 'سعة البطارية القابلة للاستخدام',
    isKeySpec: true,
  },
  {
    key: 'battery.chemistry',
    group: 'battery',
    dataType: 'text',
    labelEn: 'Battery chemistry',
    labelAr: 'كيمياء البطارية',
  },
  {
    key: 'battery.voltage_v',
    group: 'battery',
    dataType: 'number',
    unit: 'V',
    betterDirection: 'none',
    labelEn: 'System voltage',
    labelAr: 'جهد النظام',
  },
  {
    key: 'battery.warranty_years',
    group: 'battery',
    dataType: 'number',
    unit: 'year',
    betterDirection: 'higher',
    labelEn: 'Battery warranty (years)',
    labelAr: 'ضمان البطارية (سنوات)',
  },
  {
    key: 'battery.warranty_km',
    group: 'battery',
    dataType: 'number',
    unit: 'km',
    betterDirection: 'higher',
    labelEn: 'Battery warranty (distance)',
    labelAr: 'ضمان البطارية (مسافة)',
  },
  // charging (ports: variant_market_inlets; consumption: consumption_measurements)
  {
    key: 'charging.ac_max_kw',
    group: 'charging',
    dataType: 'number',
    unit: 'kW',
    betterDirection: 'higher',
    labelEn: 'Max AC charging power',
    labelAr: 'أقصى قدرة شحن AC',
    isKeySpec: true,
  },
  {
    key: 'charging.dc_peak_kw',
    group: 'charging',
    dataType: 'number',
    unit: 'kW',
    betterDirection: 'higher',
    labelEn: 'Peak DC charging power',
    labelAr: 'أقصى قدرة شحن DC (ذروة)',
    isKeySpec: true,
    descriptionEn: 'Peak, not average power. Use charging curves/times for realistic durations.',
  },
  {
    key: 'charging.ac_phases',
    group: 'charging',
    dataType: 'number',
    betterDirection: 'none',
    labelEn: 'On-board charger phases',
    labelAr: 'أطوار الشاحن المدمج',
  },
  {
    key: 'charging.v2l',
    group: 'charging',
    dataType: 'boolean',
    labelEn: 'Vehicle-to-load (V2L)',
    labelAr: 'تغذية الأجهزة (V2L)',
  },
  {
    key: 'charging.v2l_max_kw',
    group: 'charging',
    dataType: 'number',
    unit: 'kW',
    betterDirection: 'higher',
    labelEn: 'V2L max power',
    labelAr: 'أقصى قدرة V2L',
  },
  {
    key: 'charging.battery_preconditioning',
    group: 'charging',
    dataType: 'boolean',
    labelEn: 'Battery preconditioning',
    labelAr: 'التهيئة الحرارية للبطارية',
  },
  {
    key: 'charging.plug_and_charge',
    group: 'charging',
    dataType: 'boolean',
    labelEn: 'Plug & Charge',
    labelAr: 'الشحن بالتوصيل المباشر (Plug & Charge)',
  },
  // performance
  {
    key: 'performance.power_kw',
    group: 'performance',
    dataType: 'number',
    unit: 'kW',
    betterDirection: 'higher',
    labelEn: 'System power (kW)',
    labelAr: 'القوة (كيلوواط)',
    isKeySpec: true,
  },
  {
    key: 'performance.power_hp',
    group: 'performance',
    dataType: 'number',
    unit: 'hp',
    betterDirection: 'higher',
    labelEn: 'System power (hp)',
    labelAr: 'القوة (حصان)',
  },
  {
    key: 'performance.torque_nm',
    group: 'performance',
    dataType: 'number',
    unit: 'Nm',
    betterDirection: 'higher',
    labelEn: 'Torque',
    labelAr: 'عزم الدوران',
    isKeySpec: true,
  },
  {
    key: 'performance.accel_0_100_s',
    group: 'performance',
    dataType: 'number',
    unit: 's',
    betterDirection: 'lower',
    labelEn: '0–100 km/h',
    labelAr: 'التسارع 0–100 كم/س',
    isKeySpec: true,
  },
  {
    key: 'performance.top_speed_kmh',
    group: 'performance',
    dataType: 'number',
    unit: 'km/h',
    betterDirection: 'higher',
    labelEn: 'Top speed',
    labelAr: 'السرعة القصوى',
  },
  {
    key: 'performance.motors',
    group: 'performance',
    dataType: 'number',
    betterDirection: 'none',
    labelEn: 'Number of electric motors',
    labelAr: 'عدد المحركات الكهربائية',
  },
  {
    key: 'performance.engine_displacement_l',
    group: 'performance',
    dataType: 'number',
    unit: 'l',
    betterDirection: 'none',
    labelEn: 'Engine displacement (hybrids)',
    labelAr: 'سعة المحرك (الهجينة)',
  },
  // dimensions & practicality
  {
    key: 'dimensions.length_mm',
    group: 'dimensions',
    dataType: 'number',
    unit: 'mm',
    betterDirection: 'none',
    labelEn: 'Length',
    labelAr: 'الطول',
  },
  {
    key: 'dimensions.width_mm',
    group: 'dimensions',
    dataType: 'number',
    unit: 'mm',
    betterDirection: 'none',
    labelEn: 'Width',
    labelAr: 'العرض',
  },
  {
    key: 'dimensions.height_mm',
    group: 'dimensions',
    dataType: 'number',
    unit: 'mm',
    betterDirection: 'none',
    labelEn: 'Height',
    labelAr: 'الارتفاع',
  },
  {
    key: 'dimensions.wheelbase_mm',
    group: 'dimensions',
    dataType: 'number',
    unit: 'mm',
    betterDirection: 'higher',
    labelEn: 'Wheelbase',
    labelAr: 'قاعدة العجلات',
  },
  {
    key: 'dimensions.ground_clearance_mm',
    group: 'dimensions',
    dataType: 'number',
    unit: 'mm',
    betterDirection: 'higher',
    labelEn: 'Ground clearance',
    labelAr: 'الخلوص الأرضي',
  },
  {
    key: 'dimensions.curb_weight_kg',
    group: 'dimensions',
    dataType: 'number',
    unit: 'kg',
    betterDirection: 'lower',
    labelEn: 'Curb weight',
    labelAr: 'الوزن فارغة',
  },
  {
    key: 'practicality.trunk_l',
    group: 'practicality',
    dataType: 'number',
    unit: 'l',
    betterDirection: 'higher',
    labelEn: 'Trunk volume',
    labelAr: 'سعة الصندوق',
  },
  {
    key: 'practicality.trunk_max_l',
    group: 'practicality',
    dataType: 'number',
    unit: 'l',
    betterDirection: 'higher',
    labelEn: 'Max cargo volume (seats folded)',
    labelAr: 'أقصى سعة تخزين (المقاعد مطوية)',
  },
  {
    key: 'practicality.frunk_l',
    group: 'practicality',
    dataType: 'number',
    unit: 'l',
    betterDirection: 'higher',
    labelEn: 'Front trunk (frunk)',
    labelAr: 'الصندوق الأمامي',
  },
  {
    key: 'practicality.towing_braked_kg',
    group: 'practicality',
    dataType: 'number',
    unit: 'kg',
    betterDirection: 'higher',
    labelEn: 'Towing capacity (braked)',
    labelAr: 'قدرة القطر (بفرامل)',
  },
  // safety
  {
    key: 'safety.airbags',
    group: 'safety',
    dataType: 'number',
    betterDirection: 'higher',
    labelEn: 'Airbags',
    labelAr: 'الوسائد الهوائية',
  },
  {
    key: 'safety.ncap_rating',
    group: 'safety',
    dataType: 'text',
    labelEn: 'Crash test rating',
    labelAr: 'تقييم اختبار التصادم',
  },
  {
    key: 'safety.aeb',
    group: 'safety',
    dataType: 'boolean',
    labelEn: 'Automatic emergency braking',
    labelAr: 'الكبح التلقائي في حالات الطوارئ',
  },
  {
    key: 'safety.lane_keeping',
    group: 'safety',
    dataType: 'boolean',
    labelEn: 'Lane keeping assist',
    labelAr: 'مساعد البقاء في المسار',
  },
  {
    key: 'safety.blind_spot',
    group: 'safety',
    dataType: 'boolean',
    labelEn: 'Blind-spot monitoring',
    labelAr: 'مراقبة النقطة العمياء',
  },
  {
    key: 'safety.adaptive_cruise',
    group: 'safety',
    dataType: 'boolean',
    labelEn: 'Adaptive cruise control',
    labelAr: 'مثبت السرعة التكيفي',
  },
  {
    key: 'safety.camera_360',
    group: 'safety',
    dataType: 'boolean',
    labelEn: '360° camera',
    labelAr: 'كاميرا 360°',
  },
  // comfort & tech
  {
    key: 'comfort.heat_pump',
    group: 'comfort',
    dataType: 'boolean',
    labelEn: 'Heat pump',
    labelAr: 'مضخة حرارية',
  },
  {
    key: 'comfort.panoramic_roof',
    group: 'comfort',
    dataType: 'boolean',
    labelEn: 'Panoramic roof',
    labelAr: 'سقف بانورامي',
  },
  {
    key: 'comfort.ventilated_seats',
    group: 'comfort',
    dataType: 'boolean',
    labelEn: 'Ventilated front seats',
    labelAr: 'مقاعد أمامية مهواة',
  },
  {
    key: 'comfort.heated_seats',
    group: 'comfort',
    dataType: 'boolean',
    labelEn: 'Heated front seats',
    labelAr: 'مقاعد أمامية مدفأة',
  },
  {
    key: 'tech.screen_in',
    group: 'tech',
    dataType: 'number',
    unit: 'in',
    betterDirection: 'none',
    labelEn: 'Central screen size',
    labelAr: 'حجم الشاشة المركزية',
  },
  {
    key: 'tech.apple_carplay',
    group: 'tech',
    dataType: 'boolean',
    labelEn: 'Apple CarPlay',
    labelAr: 'Apple CarPlay',
  },
  {
    key: 'tech.android_auto',
    group: 'tech',
    dataType: 'boolean',
    labelEn: 'Android Auto',
    labelAr: 'Android Auto',
  },
  {
    key: 'tech.ota_updates',
    group: 'tech',
    dataType: 'boolean',
    labelEn: 'Over-the-air updates',
    labelAr: 'تحديثات البرمجيات عن بُعد',
  },
  // warranty
  {
    key: 'warranty.vehicle_years',
    group: 'warranty',
    dataType: 'number',
    unit: 'year',
    betterDirection: 'higher',
    labelEn: 'Vehicle warranty (years)',
    labelAr: 'ضمان السيارة (سنوات)',
  },
  {
    key: 'warranty.vehicle_km',
    group: 'warranty',
    dataType: 'number',
    unit: 'km',
    betterDirection: 'higher',
    labelEn: 'Vehicle warranty (distance)',
    labelAr: 'ضمان السيارة (مسافة)',
  },
];

/** Alternative spellings / transliterations (contract §4.7). */
export const SEARCH_ALIASES: { term: string; canonical: string }[] = [
  { term: 'بي واي دي', canonical: 'BYD' },
  { term: 'بى واى دى', canonical: 'BYD' },
  { term: 'تسلا', canonical: 'Tesla' },
  { term: 'تيسلا', canonical: 'Tesla' },
  { term: 'زيكر', canonical: 'Zeekr' },
  { term: 'زيكير', canonical: 'Zeekr' },
  { term: 'شاومي', canonical: 'Xiaomi' },
  { term: 'شياومي', canonical: 'Xiaomi' },
  { term: 'بي ام دبليو', canonical: 'BMW' },
  { term: 'بي إم دبليو', canonical: 'BMW' },
  { term: 'فولكس فاجن', canonical: 'Volkswagen' },
  { term: 'فولكسفاجن', canonical: 'Volkswagen' },
  { term: 'فولكس واجن', canonical: 'Volkswagen' },
  { term: 'VW', canonical: 'Volkswagen' },
  { term: 'هيونداي', canonical: 'Hyundai' },
  { term: 'هيونداى', canonical: 'Hyundai' },
  { term: 'كيا', canonical: 'Kia' },
  { term: 'ام جي', canonical: 'MG' },
  { term: 'إم جي', canonical: 'MG' },
  { term: 'نيو', canonical: 'NIO' },
  { term: 'اكسبنج', canonical: 'XPeng' },
  { term: 'إكس بنغ', canonical: 'XPeng' },
  { term: 'مرسيدس', canonical: 'Mercedes-Benz' },
  { term: 'اودي', canonical: 'Audi' },
  { term: 'بورشه', canonical: 'Porsche' },
  { term: 'فولفو', canonical: 'Volvo' },
  { term: 'تويوتا', canonical: 'Toyota' },
  { term: 'نيسان', canonical: 'Nissan' },
  { term: 'شيري', canonical: 'Chery' },
  { term: 'جيلي', canonical: 'Geely' },
  { term: 'هونشي', canonical: 'Hongqi' },
  { term: 'شاحن', canonical: 'charger' },
  { term: 'محطة شحن', canonical: 'charging station' },
  { term: 'سيارة كهربائية', canonical: 'electric car' },
  // --- phase 2: more brand spellings (Arabic ↔ Latin). Spellings only: the
  // presence of a name here says nothing about a brand's models or markets.
  { term: 'فوكس فاجن', canonical: 'Volkswagen' },
  { term: 'فولكس', canonical: 'Volkswagen' },
  { term: 'اكس بنج', canonical: 'XPeng' },
  { term: 'مرسيدس بنز', canonical: 'Mercedes-Benz' },
  { term: 'مارسيدس', canonical: 'Mercedes-Benz' },
  { term: 'دينزا', canonical: 'Denza' },
  { term: 'يانغ وانغ', canonical: 'Yangwang' },
  { term: 'لوسيد', canonical: 'Lucid' },
  { term: 'ريفيان', canonical: 'Rivian' },
  { term: 'بولستار', canonical: 'Polestar' },
  { term: 'لوتس', canonical: 'Lotus' },
  { term: 'شانجان', canonical: 'Changan' },
  { term: 'تشانجان', canonical: 'Changan' },
  { term: 'أفاتر', canonical: 'Avatr' },
  { term: 'ديبال', canonical: 'Deepal' },
  { term: 'ليب موتور', canonical: 'Leapmotor' },
  { term: 'جي ايه سي', canonical: 'GAC' },
  { term: 'أيون', canonical: 'Aion' },
  { term: 'دونغ فنغ', canonical: 'Dongfeng' },
  { term: 'دونج فينج', canonical: 'Dongfeng' },
  { term: 'فوياه', canonical: 'Voyah' },
  { term: 'جريت وول', canonical: 'Great Wall' },
  { term: 'أورا', canonical: 'ORA' },
  { term: 'نيتا', canonical: 'Neta' },
  { term: 'لي أوتو', canonical: 'Li Auto' },
  { term: 'سمارت', canonical: 'smart' },
  { term: 'فين فاست', canonical: 'VinFast' },
  { term: 'فينفاست', canonical: 'VinFast' },
  { term: 'رينو', canonical: 'Renault' },
  { term: 'بيجو', canonical: 'Peugeot' },
  { term: 'ستروين', canonical: 'Citroën' },
  { term: 'سيتروين', canonical: 'Citroën' },
  { term: 'أوبل', canonical: 'Opel' },
  { term: 'سكودا', canonical: 'Škoda' },
  { term: 'كوبرا', canonical: 'Cupra' },
  { term: 'فورد', canonical: 'Ford' },
  { term: 'شيفروليه', canonical: 'Chevrolet' },
  { term: 'كاديلاك', canonical: 'Cadillac' },
  { term: 'لكزس', canonical: 'Lexus' },
  { term: 'هوندا', canonical: 'Honda' },
  { term: 'مازدا', canonical: 'Mazda' },
  { term: 'سوبارو', canonical: 'Subaru' },
  { term: 'ميتسوبيشي', canonical: 'Mitsubishi' },
  { term: 'جينيسيس', canonical: 'Genesis' },
  { term: 'جاكوار', canonical: 'Jaguar' },
  { term: 'ميني', canonical: 'MINI' },
  { term: 'جيتور', canonical: 'Jetour' },
  { term: 'إكسيد', canonical: 'Exeed' },
  { term: 'أومودا', canonical: 'Omoda' },
  { term: 'جايكو', canonical: 'Jaecoo' },
  { term: 'بايك', canonical: 'BAIC' },
  // --- powertrain, charging and data vocabulary (translations of terms)
  { term: 'كهربائية بالكامل', canonical: 'BEV' },
  { term: 'هجينة قابلة للشحن', canonical: 'PHEV' },
  { term: 'بلج ان هايبرد', canonical: 'PHEV' },
  { term: 'ممدد المدى', canonical: 'EREV' },
  { term: 'هايبرد', canonical: 'hybrid' },
  { term: 'هجين', canonical: 'hybrid' },
  { term: 'شحن سريع', canonical: 'fast charging' },
  { term: 'شاحن منزلي', canonical: 'home charger' },
  { term: 'وول بوكس', canonical: 'wallbox' },
  { term: 'تايب 2', canonical: 'Type 2' },
  { term: 'سي سي اس', canonical: 'CCS' },
  { term: 'تشاديمو', canonical: 'CHAdeMO' },
  { term: 'جي بي تي', canonical: 'GB/T' },
  { term: 'بطارية', canonical: 'battery' },
  { term: 'مدى القيادة', canonical: 'range' },
  { term: 'تحديث عن بعد', canonical: 'OTA update' },
];

/**
 * Default news categories (REQUIREMENTS §5: news, reviews, test drives,
 * batteries & charging, software & car updates, safety technology, buying
 * guides). Created by the reference seed only when missing (looked up by
 * `systemKey`, or adopted by slug); admins may rename or deactivate them.
 * `systemKey` is stable and may be used by code (e.g. the home "charging
 * guides" section uses `batteries_charging`).
 */
export interface DefaultCategory {
  systemKey: string;
  slug: string;
  defaultArticleType:
    'news' | 'review' | 'test_drive' | 'buying_guide' | 'explainer' | 'opinion' | null;
  sortOrder: number;
  translations: {
    ar: { name: string; description: string };
    en: { name: string; description: string };
  };
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  {
    systemKey: 'news',
    slug: 'news',
    defaultArticleType: 'news',
    sortOrder: 10,
    translations: {
      ar: { name: 'أخبار', description: 'أخبار السيارات الكهربائية والهجينة.' },
      en: { name: 'News', description: 'Electric and hybrid car news.' },
    },
  },
  {
    systemKey: 'reviews',
    slug: 'reviews',
    defaultArticleType: 'review',
    sortOrder: 20,
    translations: {
      ar: { name: 'مراجعات', description: 'مراجعات السيارات وتقييمها.' },
      en: { name: 'Reviews', description: 'Car reviews and evaluations.' },
    },
  },
  {
    systemKey: 'test_drives',
    slug: 'test-drives',
    defaultArticleType: 'test_drive',
    sortOrder: 30,
    translations: {
      ar: { name: 'تجارب القيادة', description: 'انطباعات من تجارب قيادة فعلية.' },
      en: { name: 'Test drives', description: 'Impressions from real test drives.' },
    },
  },
  {
    systemKey: 'batteries_charging',
    slug: 'batteries-charging',
    defaultArticleType: null,
    sortOrder: 40,
    translations: {
      ar: {
        name: 'البطاريات والشحن',
        description: 'أخبار وأدلة البطاريات والشحن المنزلي والسريع.',
      },
      en: {
        name: 'Batteries & charging',
        description: 'Battery, home charging and fast charging news and guides.',
      },
    },
  },
  {
    systemKey: 'software_ota',
    slug: 'software-ota',
    defaultArticleType: null,
    sortOrder: 50,
    translations: {
      ar: {
        name: 'البرمجيات وتحديثات السيارات',
        description: 'البرمجيات والأنظمة والتحديثات عن بُعد.',
      },
      en: {
        name: 'Software & OTA updates',
        description: 'Car software, systems and over-the-air updates.',
      },
    },
  },
  {
    systemKey: 'safety',
    slug: 'safety',
    defaultArticleType: null,
    sortOrder: 60,
    translations: {
      ar: { name: 'تقنيات الأمان', description: 'أنظمة الأمان والمساعدة على القيادة.' },
      en: { name: 'Safety technology', description: 'Safety and driver-assistance systems.' },
    },
  },
  {
    systemKey: 'buying_guides',
    slug: 'buying-guides',
    defaultArticleType: 'buying_guide',
    sortOrder: 70,
    translations: {
      ar: { name: 'أدلة الشراء', description: 'إرشادات لاختيار السيارة المناسبة.' },
      en: { name: 'Buying guides', description: 'Guidance for choosing the right car.' },
    },
  },
];

/**
 * Spec keys that existed in earlier releases and were replaced by structured
 * tables; the reference seed deletes them when no row uses them.
 */
export const RETIRED_SPEC_KEYS: readonly string[] = [
  'charging.ac_port',
  'charging.dc_port',
  'efficiency.consumption_wh_km',
  'efficiency.fuel_l_100km',
];
