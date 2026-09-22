<?php

namespace Database\Seeders\Vehicles;

use App\Modules\Vehicles\Models\BatteryVariant;
use App\Modules\Vehicles\Models\ConnectorCompatibilityRule;
use App\Modules\Vehicles\Models\ConnectorType;
use App\Modules\Vehicles\Models\Enums\Compatibility;
use App\Modules\Vehicles\Models\Enums\CurrentType;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\VehicleMake;
use App\Modules\Vehicles\Models\VehicleModel;
use App\Modules\Vehicles\Models\VehicleVariant;
use App\Modules\Vehicles\Services\VehicleDataService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Vehicle master data: connector types, connector compatibility rules, battery packs and the
 * makes / models / variants commonly found in Egypt (Chinese-market GB/T imports and
 * European / Gulf / local-agent Type 2 + CCS2 versions).
 *
 * Idempotent (safe to run on every deploy): rows are matched on their natural keys with
 * updateOrCreate. Descriptive/spec columns are refreshed from this file, but operator decisions are
 * never overwritten: `is_active`, `sort_order` changes and make logos are left alone on existing rows,
 * and an existing compatibility rule (possibly verified by staff in the matrix editor) is never touched.
 *
 * Specifications are APPROXIMATE public figures (every variant carries the note
 * "approximate public spec; verify") — they help members pick their car, they are not a source of truth.
 */
class VehiclesMasterSeeder extends Seeder
{
    public const SPEC_NOTE = 'approximate public spec; verify';

    /** code => [name_ar, name_en, current_type, sort] */
    private const CONNECTORS = [
        'type2' => ['تايب 2 (منيكس) - تيار متردد', 'Type 2 (Mennekes) AC', 'ac', 10],
        'gbt_ac' => ['جي بي/تي - تيار متردد (المواصفة الصينية)', 'GB/T AC (Chinese standard)', 'ac', 20],
        'ccs2' => ['CCS2 (كومبو 2) - تيار مستمر', 'CCS2 (Combo 2) DC', 'dc', 30],
        'gbt_dc' => ['جي بي/تي - تيار مستمر (المواصفة الصينية)', 'GB/T DC (Chinese standard)', 'dc', 40],
        'chademo' => ['تشاديمو - تيار مستمر', 'CHAdeMO DC', 'dc', 50],
        'nacs' => ['NACS (تسلا أمريكا الشمالية)', 'NACS (Tesla North America)', 'dc', 60],
    ];

    /**
     * [vehicle connector, station connector, compatibility, adapter name, notes]
     * Same-type pairs are direct; pairs not listed stay "not set" (shown as unknown, never assumed).
     */
    private const RULES = [
        ['type2', 'type2', 'direct', null, null],
        ['gbt_ac', 'gbt_ac', 'direct', null, null],
        ['ccs2', 'ccs2', 'direct', null, null],
        ['gbt_dc', 'gbt_dc', 'direct', null, null],
        ['chademo', 'chademo', 'direct', null, null],
        ['nacs', 'nacs', 'direct', null, null],
        ['type2', 'gbt_ac', 'adapter', 'GB/T AC → Type 2 adapter', 'AC charging only; use a certified adapter rated for the charger current.'],
        ['gbt_ac', 'type2', 'adapter', 'Type 2 → GB/T AC adapter', 'AC charging only; use a certified adapter rated for the charger current.'],
        ['ccs2', 'gbt_dc', 'incompatible', null, 'Different DC communication protocols (PLC vs CAN); no safe passive adapter.'],
        ['gbt_dc', 'ccs2', 'incompatible', null, 'Different DC communication protocols (CAN vs PLC); no safe passive adapter.'],
        ['chademo', 'ccs2', 'incompatible', null, 'Different DC plug and protocol.'],
        ['ccs2', 'chademo', 'incompatible', null, 'Different DC plug and protocol.'],
        ['nacs', 'ccs2', 'adapter', 'CCS2 → NACS DC adapter', 'Check that the adapter and the vehicle software support DC charging through it.'],
        ['ccs2', 'nacs', 'adapter', 'NACS → CCS2 DC adapter', 'Only at stations that allow third-party adapters.'],
    ];

    /** preset => [market_version, ac connector code, dc connector code] */
    private const MARKETS = [
        'eu' => ['europe', 'type2', 'ccs2'],
        'gulf' => ['gulf', 'type2', 'ccs2'],
        'eg' => ['egypt', 'type2', 'ccs2'],
        'cn' => ['china', 'gbt_ac', 'gbt_dc'],
        'chademo' => ['europe', 'type2', 'chademo'],
        'us' => ['other', null, 'nacs'],
        'ac_only' => ['europe', 'type2', null],
    ];

    /**
     * slug => [name_en, name_ar, country, models]
     * model slug => [name_en, name_ar, body_type, variants]
     * variant => [trim_en, trim_ar, market preset, year_from, year_to, battery kWh, chemistry, motor kW, WLTP/CLTC range km]
     */
    private function catalog(): array
    {
        return [
            'byd' => ['BYD', 'بي واي دي', 'CN', [
                'atto-3' => ['Atto 3', 'أتو 3', 'suv', [
                    ['Standard Range', 'المدى القياسي', 'eu', 2023, null, 49.92, 'LFP', 150, 345],
                    ['Extended Range', 'المدى الممتد', 'eu', 2022, null, 60.48, 'LFP', 150, 420],
                    ['Extended Range', 'المدى الممتد', 'eg', 2023, null, 60.48, 'LFP', 150, 420],
                    ['Extended Range', 'المدى الممتد', 'gulf', 2022, null, 60.48, 'LFP', 150, 420],
                    ['Yuan Plus', 'يوان بلس', 'cn', 2022, null, 60.48, 'LFP', 150, 510],
                ]],
                'dolphin' => ['Dolphin', 'دولفين', 'hatchback', [
                    ['Active', 'أكتيف', 'eu', 2023, null, 44.90, 'LFP', 70, 340],
                    ['Comfort', 'كومفورت', 'eu', 2023, null, 60.48, 'LFP', 150, 427],
                    ['Standard', 'ستاندرد', 'cn', 2021, null, 44.90, 'LFP', 70, 420],
                ]],
                'seal' => ['Seal', 'سيل', 'sedan', [
                    ['Design RWD', 'ديزاين دفع خلفي', 'eu', 2023, null, 82.56, 'LFP', 230, 570],
                    ['Excellence AWD', 'إكسلنس دفع رباعي', 'eu', 2023, null, 82.56, 'LFP', 390, 520],
                    ['Long Range', 'المدى الطويل', 'cn', 2022, null, 82.56, 'LFP', 230, 700],
                ]],
                'han' => ['Han', 'هان', 'sedan', [
                    ['EV', 'كهربائية', 'cn', 2020, null, 85.44, 'LFP', 222, 605],
                    ['EV', 'كهربائية', 'gulf', 2022, null, 85.44, 'LFP', 380, 521],
                ]],
                'tang' => ['Tang', 'تانج', 'suv', [
                    ['EV AWD', 'كهربائية دفع رباعي', 'eu', 2022, null, 108.80, 'LFP', 380, 400],
                ]],
                'seagull' => ['Seagull', 'سي جل', 'hatchback', [
                    ['Standard', 'ستاندرد', 'cn', 2023, null, 30.08, 'LFP', 55, 305],
                    ['Flying', 'فلاينج', 'cn', 2023, null, 38.88, 'LFP', 55, 405],
                ]],
                'song-plus' => ['Song Plus EV', 'سونج بلس', 'suv', [
                    ['EV', 'كهربائية', 'cn', 2021, null, 71.80, 'LFP', 150, 505],
                ]],
            ]],
            'mg' => ['MG', 'إم جي', 'CN', [
                'zs-ev' => ['ZS EV', 'ZS الكهربائية', 'suv', [
                    ['Standard', 'ستاندرد', 'eu', 2019, 2021, 44.50, 'NMC', 105, 263],
                    ['Standard Range', 'المدى القياسي', 'eu', 2022, null, 51.00, 'LFP', 130, 320],
                    ['Long Range', 'المدى الطويل', 'eu', 2022, null, 72.60, 'NMC', 115, 440],
                    ['Standard Range', 'المدى القياسي', 'eg', 2022, null, 51.00, 'LFP', 130, 320],
                ]],
                'mg4' => ['MG4 Electric', 'MG4 الكهربائية', 'hatchback', [
                    ['Standard Range', 'المدى القياسي', 'eu', 2022, null, 51.00, 'LFP', 125, 350],
                    ['Long Range', 'المدى الطويل', 'eu', 2022, null, 64.00, 'NMC', 150, 450],
                    ['Extended Range', 'المدى الممتد', 'eu', 2023, null, 77.00, 'NMC', 180, 520],
                    ['Mulan', 'مولان', 'cn', 2022, null, 51.00, 'LFP', 125, 425],
                ]],
                'mg5-ev' => ['MG5 EV', 'MG5 الكهربائية', 'other', [
                    ['Long Range', 'المدى الطويل', 'eu', 2021, null, 61.10, 'NMC', 115, 400],
                ]],
                'marvel-r' => ['Marvel R', 'مارفل آر', 'suv', [
                    ['Electric', 'كهربائية', 'eu', 2021, 2023, 70.00, 'NMC', 212, 402],
                ]],
            ]],
            'tesla' => ['Tesla', 'تسلا', 'US', [
                'model-3' => ['Model 3', 'موديل 3', 'sedan', [
                    ['RWD', 'دفع خلفي', 'eu', 2021, null, 60.00, 'LFP', 208, 491],
                    ['Long Range AWD', 'المدى الطويل دفع رباعي', 'eu', 2019, null, 78.00, 'NCA', 324, 602],
                    ['Performance', 'بيرفورمانس', 'eu', 2019, null, 78.00, 'NCA', 377, 547],
                    ['RWD', 'دفع خلفي', 'cn', 2021, null, 60.00, 'LFP', 208, 556],
                    ['Long Range AWD (US import)', 'المدى الطويل دفع رباعي (وارد أمريكا)', 'us', 2019, null, 78.00, 'NCA', 324, 568],
                ]],
                'model-y' => ['Model Y', 'موديل Y', 'suv', [
                    ['RWD', 'دفع خلفي', 'eu', 2022, null, 60.00, 'LFP', 220, 455],
                    ['Long Range AWD', 'المدى الطويل دفع رباعي', 'eu', 2021, null, 78.00, 'NCA', 378, 533],
                    ['Performance', 'بيرفورمانس', 'eu', 2021, null, 78.00, 'NCA', 393, 514],
                    ['RWD', 'دفع خلفي', 'cn', 2022, null, 60.00, 'LFP', 220, 545],
                ]],
                'model-s' => ['Model S', 'موديل S', 'sedan', [
                    ['Long Range', 'المدى الطويل', 'eu', 2021, null, 100.00, 'NCA', 500, 634],
                ]],
            ]],
            'nissan' => ['Nissan', 'نيسان', 'JP', [
                'leaf' => ['Leaf', 'ليف', 'hatchback', [
                    ['30 kWh', '30 ك.و.س', 'chademo', 2016, 2017, 30.00, 'NMC', 80, 250],
                    ['40 kWh', '40 ك.و.س', 'chademo', 2018, null, 40.00, 'NMC', 110, 270],
                    ['e+ 62 kWh', 'e+ 62 ك.و.س', 'chademo', 2019, null, 62.00, 'NMC', 160, 385],
                ]],
                'ariya' => ['Ariya', 'آريا', 'suv', [
                    ['63 kWh', '63 ك.و.س', 'eu', 2022, null, 63.00, 'NMC', 160, 403],
                    ['87 kWh', '87 ك.و.س', 'eu', 2022, null, 87.00, 'NMC', 178, 533],
                ]],
            ]],
            'hyundai' => ['Hyundai', 'هيونداي', 'KR', [
                'kona-electric' => ['Kona Electric', 'كونا الكهربائية', 'suv', [
                    ['39 kWh', '39 ك.و.س', 'eu', 2018, 2023, 39.20, 'NMC', 100, 305],
                    ['64 kWh', '64 ك.و.س', 'eu', 2018, 2023, 64.00, 'NMC', 150, 484],
                    ['48.4 kWh (2nd gen)', '48.4 ك.و.س (الجيل الثاني)', 'eu', 2023, null, 48.40, 'NMC', 115, 377],
                    ['65.4 kWh (2nd gen)', '65.4 ك.و.س (الجيل الثاني)', 'eu', 2023, null, 65.40, 'NMC', 160, 514],
                ]],
                'ioniq-5' => ['IONIQ 5', 'أيونيك 5', 'crossover', [
                    ['Standard Range', 'المدى القياسي', 'eu', 2021, 2022, 58.00, 'NMC', 125, 384],
                    ['Long Range', 'المدى الطويل', 'eu', 2021, 2023, 77.40, 'NMC', 168, 481],
                    ['Long Range 84 kWh', 'المدى الطويل 84 ك.و.س', 'eu', 2024, null, 84.00, 'NMC', 168, 570],
                ]],
                'ioniq-6' => ['IONIQ 6', 'أيونيك 6', 'sedan', [
                    ['Standard Range', 'المدى القياسي', 'eu', 2022, null, 53.00, 'NMC', 111, 429],
                    ['Long Range', 'المدى الطويل', 'eu', 2022, null, 77.40, 'NMC', 168, 614],
                ]],
                'ioniq-electric' => ['IONIQ Electric', 'أيونيك الكهربائية', 'hatchback', [
                    ['28 kWh', '28 ك.و.س', 'eu', 2016, 2019, 28.00, 'NMC', 88, 204],
                    ['38.3 kWh', '38.3 ك.و.س', 'eu', 2019, 2022, 38.30, 'NMC', 100, 311],
                ]],
            ]],
            'kia' => ['Kia', 'كيا', 'KR', [
                'ev6' => ['EV6', 'EV6', 'crossover', [
                    ['Standard Range', 'المدى القياسي', 'eu', 2021, null, 58.00, 'NMC', 125, 394],
                    ['Long Range', 'المدى الطويل', 'eu', 2021, null, 77.40, 'NMC', 168, 528],
                    ['GT', 'GT', 'eu', 2022, null, 77.40, 'NMC', 430, 424],
                ]],
                'niro-ev' => ['Niro EV / e-Niro', 'نيرو الكهربائية', 'suv', [
                    ['e-Niro 64 kWh', 'e-Niro 64 ك.و.س', 'eu', 2019, 2022, 64.00, 'NMC', 150, 455],
                    ['Niro EV 64.8 kWh', 'نيرو EV 64.8 ك.و.س', 'eu', 2022, null, 64.80, 'NMC', 150, 460],
                ]],
                'ev5' => ['EV5', 'EV5', 'suv', [
                    ['Standard', 'ستاندرد', 'gulf', 2024, null, 64.20, 'LFP', 160, 400],
                    ['Long Range', 'المدى الطويل', 'cn', 2023, null, 88.00, 'LFP', 160, 720],
                ]],
                'ev9' => ['EV9', 'EV9', 'suv', [
                    ['Long Range', 'المدى الطويل', 'eu', 2023, null, 99.80, 'NMC', 283, 505],
                ]],
            ]],
            'volkswagen' => ['Volkswagen', 'فولكس فاجن', 'DE', [
                'id-4' => ['ID.4', 'ID.4', 'suv', [
                    ['Pure', 'بيور', 'eu', 2021, null, 52.00, 'NMC', 125, 360],
                    ['Pro', 'برو', 'eu', 2021, null, 77.00, 'NMC', 150, 520],
                    ['Crozz Pro', 'كروز برو', 'cn', 2021, null, 83.40, 'NMC', 150, 555],
                    ['X Pro', 'إكس برو', 'cn', 2021, null, 83.40, 'NMC', 150, 555],
                    ['Crozz Pure+', 'كروز بيور+', 'cn', 2021, null, 57.30, 'NMC', 125, 425],
                ]],
                'id-3' => ['ID.3', 'ID.3', 'hatchback', [
                    ['Pure', 'بيور', 'eu', 2020, null, 45.00, 'NMC', 110, 350],
                    ['Pro', 'برو', 'eu', 2020, null, 58.00, 'NMC', 150, 426],
                    ['Pro S', 'برو إس', 'eu', 2021, null, 77.00, 'NMC', 150, 546],
                ]],
                'id-6' => ['ID.6', 'ID.6', 'suv', [
                    ['Crozz Pro', 'كروز برو', 'cn', 2021, null, 83.40, 'NMC', 150, 565],
                    ['X Pro', 'إكس برو', 'cn', 2021, null, 83.40, 'NMC', 150, 565],
                ]],
                'e-golf' => ['e-Golf', 'e-Golf', 'hatchback', [
                    ['35.8 kWh', '35.8 ك.و.س', 'eu', 2017, 2020, 35.80, 'NMC', 100, 231],
                ]],
            ]],
            'chery' => ['Chery', 'شيري', 'CN', [
                'eq1' => ['eQ1', 'eQ1', 'hatchback', [
                    ['Standard', 'ستاندرد', 'cn', 2017, 2023, 38.00, 'NMC', 35, 301],
                ]],
            ]],
            'omoda' => ['Omoda', 'أومودا', 'CN', [
                'e5' => ['E5', 'E5', 'suv', [
                    ['Standard', 'ستاندرد', 'eg', 2024, null, 61.00, 'LFP', 150, 430],
                    ['Standard', 'ستاندرد', 'eu', 2024, null, 61.00, 'LFP', 150, 430],
                    ['Standard', 'ستاندرد', 'gulf', 2024, null, 61.00, 'LFP', 150, 430],
                ]],
            ]],
            'geely' => ['Geely', 'جيلي', 'CN', [
                'geometry-c' => ['Geometry C', 'جيومتري C', 'crossover', [
                    ['Long Range', 'المدى الطويل', 'cn', 2020, null, 70.00, 'NMC', 150, 550],
                    ['Long Range', 'المدى الطويل', 'gulf', 2022, null, 70.00, 'NMC', 150, 450],
                ]],
                'galaxy-e5' => ['Galaxy E5 / EX5', 'جالاكسي E5 / EX5', 'suv', [
                    ['Standard', 'ستاندرد', 'cn', 2024, null, 49.52, 'LFP', 160, 440],
                    ['Long Range', 'المدى الطويل', 'cn', 2024, null, 60.22, 'LFP', 160, 530],
                    ['EX5 Long Range', 'EX5 المدى الطويل', 'eu', 2024, null, 60.22, 'LFP', 160, 430],
                ]],
            ]],
            'zeekr' => ['Zeekr', 'زيكر', 'CN', [
                '001' => ['001', '001', 'crossover', [
                    ['Long Range RWD', 'المدى الطويل دفع خلفي', 'cn', 2021, null, 100.00, 'NMC', 400, 741],
                    ['Long Range RWD', 'المدى الطويل دفع خلفي', 'eu', 2024, null, 100.00, 'NMC', 400, 620],
                    ['Standard AWD', 'ستاندرد دفع رباعي', 'cn', 2021, null, 86.00, 'NMC', 400, 546],
                ]],
                'x' => ['X', 'X', 'suv', [
                    ['Long Range', 'المدى الطويل', 'eu', 2023, null, 66.00, 'NMC', 200, 445],
                    ['Long Range', 'المدى الطويل', 'cn', 2023, null, 66.00, 'NMC', 200, 560],
                ]],
                '007' => ['007', '007', 'sedan', [
                    ['RWD', 'دفع خلفي', 'cn', 2024, null, 75.00, 'LFP', 310, 688],
                    ['AWD', 'دفع رباعي', 'cn', 2024, null, 100.00, 'NMC', 475, 770],
                ]],
            ]],
            'xpeng' => ['Xpeng', 'إكس بنج', 'CN', [
                'p7' => ['P7', 'P7', 'sedan', [
                    ['Long Range', 'المدى الطويل', 'cn', 2020, null, 80.87, 'NMC', 203, 706],
                    ['Long Range', 'المدى الطويل', 'eu', 2022, null, 86.20, 'NMC', 203, 576],
                ]],
                'g9' => ['G9', 'G9', 'suv', [
                    ['Long Range', 'المدى الطويل', 'cn', 2022, null, 98.00, 'NMC', 230, 702],
                    ['Long Range', 'المدى الطويل', 'eu', 2023, null, 98.00, 'NMC', 230, 570],
                ]],
                'g6' => ['G6', 'G6', 'suv', [
                    ['Standard Range', 'المدى القياسي', 'cn', 2023, null, 66.00, 'LFP', 218, 580],
                    ['Long Range', 'المدى الطويل', 'eu', 2024, null, 87.50, 'NMC', 210, 570],
                ]],
            ]],
            'smart' => ['Smart', 'سمارت', 'DE', [
                '1' => ['#1', '#1', 'suv', [
                    ['Pro+', 'برو+', 'eu', 2022, null, 66.00, 'NMC', 200, 440],
                    ['Pro+', 'برو+', 'cn', 2022, null, 66.00, 'NMC', 200, 560],
                ]],
                '3' => ['#3', '#3', 'crossover', [
                    ['Pro+', 'برو+', 'eu', 2023, null, 66.00, 'NMC', 200, 455],
                ]],
                'fortwo-eq' => ['fortwo EQ', 'فورتو EQ', 'hatchback', [
                    ['17.6 kWh', '17.6 ك.و.س', 'ac_only', 2017, 2023, 17.60, 'NMC', 60, 135],
                ]],
            ]],
            'volvo' => ['Volvo', 'فولفو', 'SE', [
                'xc40-recharge' => ['XC40 Recharge / EX40', 'XC40 ريتشارج / EX40', 'suv', [
                    ['Single Motor', 'محرك واحد', 'eu', 2022, null, 69.00, 'NMC', 175, 460],
                    ['Twin Motor', 'محركان', 'eu', 2020, null, 78.00, 'NMC', 300, 418],
                ]],
                'c40-recharge' => ['C40 Recharge / EC40', 'C40 ريتشارج / EC40', 'crossover', [
                    ['Twin Motor', 'محركان', 'eu', 2021, null, 78.00, 'NMC', 300, 441],
                ]],
                'ex30' => ['EX30', 'EX30', 'suv', [
                    ['Single Motor', 'محرك واحد', 'eu', 2023, null, 51.00, 'LFP', 200, 344],
                    ['Single Motor Extended Range', 'محرك واحد مدى ممتد', 'eu', 2023, null, 69.00, 'NMC', 200, 476],
                ]],
            ]],
            'bmw' => ['BMW', 'بي إم دبليو', 'DE', [
                'i3' => ['i3', 'i3', 'hatchback', [
                    ['60 Ah', '60 أمبير ساعة', 'eu', 2013, 2016, 22.00, 'NMC', 125, 190],
                    ['94 Ah', '94 أمبير ساعة', 'eu', 2016, 2018, 33.00, 'NMC', 125, 260],
                    ['120 Ah', '120 أمبير ساعة', 'eu', 2019, 2022, 42.20, 'NMC', 125, 310],
                ]],
                'ix3' => ['iX3', 'iX3', 'suv', [
                    ['80 kWh', '80 ك.و.س', 'eu', 2020, null, 80.00, 'NMC', 210, 460],
                ]],
                'i4' => ['i4', 'i4', 'sedan', [
                    ['eDrive40', 'eDrive40', 'eu', 2021, null, 83.90, 'NMC', 250, 590],
                ]],
                'ix' => ['iX', 'iX', 'suv', [
                    ['xDrive40', 'xDrive40', 'eu', 2021, null, 76.60, 'NMC', 240, 425],
                    ['xDrive50', 'xDrive50', 'eu', 2021, null, 111.50, 'NMC', 385, 630],
                ]],
                'ix1' => ['iX1', 'iX1', 'suv', [
                    ['xDrive30', 'xDrive30', 'eu', 2022, null, 64.70, 'NMC', 230, 440],
                ]],
            ]],
            'mercedes-benz' => ['Mercedes-Benz', 'مرسيدس بنز', 'DE', [
                'eqa' => ['EQA', 'EQA', 'suv', [
                    ['EQA 250', 'EQA 250', 'eu', 2021, null, 66.50, 'NMC', 140, 426],
                ]],
                'eqb' => ['EQB', 'EQB', 'suv', [
                    ['EQB 300 4MATIC', 'EQB 300 4MATIC', 'eu', 2021, null, 66.50, 'NMC', 168, 419],
                ]],
                'eqc' => ['EQC', 'EQC', 'suv', [
                    ['EQC 400 4MATIC', 'EQC 400 4MATIC', 'eu', 2019, 2023, 80.00, 'NMC', 300, 437],
                ]],
                'eqe' => ['EQE', 'EQE', 'sedan', [
                    ['EQE 350+', 'EQE 350+', 'eu', 2022, null, 90.60, 'NMC', 215, 654],
                ]],
                'eqs' => ['EQS', 'EQS', 'sedan', [
                    ['EQS 450+', 'EQS 450+', 'eu', 2021, null, 107.80, 'NMC', 245, 780],
                ]],
            ]],
            'peugeot' => ['Peugeot', 'بيجو', 'FR', [
                'e-208' => ['e-208', 'e-208', 'hatchback', [
                    ['50 kWh', '50 ك.و.س', 'eu', 2019, 2023, 50.00, 'NMC', 100, 362],
                    ['51 kWh', '51 ك.و.س', 'eu', 2023, null, 51.00, 'NMC', 115, 410],
                ]],
                'e-2008' => ['e-2008', 'e-2008', 'suv', [
                    ['50 kWh', '50 ك.و.س', 'eu', 2020, 2023, 50.00, 'NMC', 100, 345],
                    ['54 kWh', '54 ك.و.س', 'eu', 2023, null, 54.00, 'NMC', 115, 406],
                ]],
            ]],
            'citroen' => ['Citroën', 'سيتروين', 'FR', [
                'e-c4' => ['ë-C4', 'ë-C4', 'hatchback', [
                    ['50 kWh', '50 ك.و.س', 'eu', 2021, 2023, 50.00, 'NMC', 100, 357],
                    ['54 kWh', '54 ك.و.س', 'eu', 2023, null, 54.00, 'NMC', 115, 420],
                ]],
            ]],
            'renault' => ['Renault', 'رينو', 'FR', [
                'zoe' => ['Zoe', 'زوي', 'hatchback', [
                    ['R240 22 kWh', 'R240 22 ك.و.س', 'ac_only', 2013, 2016, 22.00, 'NMC', 65, 240],
                    ['Z.E. 40', 'Z.E. 40', 'ac_only', 2017, 2019, 41.00, 'NMC', 80, 300],
                    ['Z.E. 50', 'Z.E. 50', 'eu', 2019, 2024, 52.00, 'NMC', 100, 395],
                ]],
                'megane-e-tech' => ['Megane E-Tech', 'ميجان E-Tech', 'crossover', [
                    ['EV40', 'EV40', 'eu', 2022, null, 40.00, 'NMC', 96, 300],
                    ['EV60', 'EV60', 'eu', 2022, null, 60.00, 'NMC', 160, 470],
                ]],
            ]],
            'leapmotor' => ['Leapmotor', 'ليب موتور', 'CN', [
                'c11' => ['C11', 'C11', 'suv', [
                    ['Standard', 'ستاندرد', 'cn', 2021, null, 78.50, 'LFP', 200, 610],
                ]],
                'c10' => ['C10', 'C10', 'suv', [
                    ['Standard', 'ستاندرد', 'eu', 2024, null, 69.90, 'LFP', 160, 420],
                ]],
                't03' => ['T03', 'T03', 'hatchback', [
                    ['Standard', 'ستاندرد', 'eu', 2024, null, 37.30, 'LFP', 70, 265],
                    ['Standard', 'ستاندرد', 'cn', 2020, null, 36.50, 'LFP', 55, 403],
                ]],
            ]],
            'gac-aion' => ['GAC Aion', 'جي إيه سي أيون', 'CN', [
                'aion-s' => ['Aion S', 'أيون S', 'sedan', [
                    ['Plus', 'بلس', 'cn', 2021, null, 58.80, 'LFP', 150, 510],
                    ['Standard', 'ستاندرد', 'gulf', 2023, null, 58.80, 'LFP', 150, 450],
                ]],
                'aion-y' => ['Aion Y', 'أيون Y', 'suv', [
                    ['Plus', 'بلس', 'cn', 2023, null, 63.98, 'LFP', 150, 510],
                    ['Plus', 'بلس', 'gulf', 2023, null, 63.98, 'LFP', 150, 490],
                ]],
                'aion-v' => ['Aion V', 'أيون V', 'suv', [
                    ['Plus', 'بلس', 'cn', 2020, null, 80.00, 'NMC', 165, 600],
                ]],
            ]],
            'neta' => ['Neta', 'نيتا', 'CN', [
                'neta-v' => ['Neta V', 'نيتا V', 'suv', [
                    ['Standard', 'ستاندرد', 'cn', 2020, null, 38.54, 'LFP', 70, 401],
                    ['Standard', 'ستاندرد', 'gulf', 2022, null, 38.54, 'LFP', 70, 380],
                ]],
                'neta-u' => ['Neta U', 'نيتا U', 'suv', [
                    ['Pro', 'برو', 'cn', 2021, null, 68.00, 'NMC', 120, 500],
                ]],
                'neta-s' => ['Neta S', 'نيتا S', 'sedan', [
                    ['Long Range', 'المدى الطويل', 'cn', 2022, null, 74.40, 'LFP', 170, 520],
                ]],
            ]],
            'dongfeng' => ['Dongfeng', 'دونج فينج', 'CN', [
                'box' => ['Box (Nammi 01)', 'بوكس (نامي 01)', 'hatchback', [
                    ['Standard', 'ستاندرد', 'cn', 2023, null, 42.30, 'LFP', 70, 430],
                ]],
                'aeolus-e70' => ['Aeolus E70', 'إيولوس E70', 'sedan', [
                    ['Standard', 'ستاندرد', 'cn', 2019, null, 52.50, 'LFP', 90, 405],
                    ['Standard', 'ستاندرد', 'eg', 2022, null, 52.50, 'LFP', 90, 380],
                ]],
                'voyah-free' => ['Voyah Free', 'فوياه فري', 'suv', [
                    ['EV', 'كهربائية', 'cn', 2021, null, 88.00, 'NMC', 255, 505],
                ]],
            ]],
        ];
    }

    public function run(): void
    {
        DB::transaction(function () {
            $connectors = $this->seedConnectors();
            $this->seedRules($connectors);
            $this->seedCatalog($connectors);
        });
        app(VehicleDataService::class)->flush();
    }

    /** @return array<string, int> code => id */
    private function seedConnectors(): array
    {
        $ids = [];
        foreach (self::CONNECTORS as $code => [$nameAr, $nameEn, $current, $sort]) {
            $connector = ConnectorType::query()->firstOrNew(['code' => $code]);
            $connector->fill(['name_ar' => $nameAr, 'name_en' => $nameEn, 'current_type' => CurrentType::from($current)]);
            if (! $connector->exists) {
                $connector->fill(['is_active' => true, 'sort_order' => $sort]);
            }
            $connector->save();
            $ids[$code] = $connector->id;
        }

        return $ids;
    }

    /** @param  array<string, int>  $connectors */
    private function seedRules(array $connectors): void
    {
        foreach (self::RULES as [$vehicle, $station, $compatibility, $adapter, $notes]) {
            // Existing rules are never touched: staff may have corrected / verified them in the matrix editor.
            ConnectorCompatibilityRule::query()->firstOrCreate(
                ['vehicle_connector_type_id' => $connectors[$vehicle], 'station_connector_type_id' => $connectors[$station]],
                ['compatibility' => Compatibility::from($compatibility), 'adapter_name' => $adapter, 'notes' => $notes],
            );
        }
    }

    /** @param  array<string, int>  $connectors */
    private function seedCatalog(array $connectors): void
    {
        $makeOrder = 0;
        foreach ($this->catalog() as $makeSlug => [$makeEn, $makeAr, $country, $models]) {
            $makeOrder += 10;
            $make = $this->upsert(VehicleMake::query()->firstOrNew(['slug' => $makeSlug]),
                ['name_en' => $makeEn, 'name_ar' => $makeAr, 'country_code' => $country],
                ['is_active' => true, 'sort_order' => $makeOrder]);

            $modelOrder = 0;
            foreach ($models as $modelSlug => [$modelEn, $modelAr, $body, $variants]) {
                $modelOrder += 10;
                $model = $this->upsert(VehicleModel::query()->firstOrNew(['vehicle_make_id' => $make->id, 'slug' => Str::slug($modelSlug)]),
                    ['name_en' => $modelEn, 'name_ar' => $modelAr, 'body_type' => $body],
                    ['is_active' => true, 'sort_order' => $modelOrder]);

                $variantOrder = 0;
                foreach ($variants as [$trimEn, $trimAr, $preset, $from, $to, $kwh, $chemistry, $motorKw, $rangeKm]) {
                    $variantOrder += 10;
                    [$market, $ac, $dc] = self::MARKETS[$preset];
                    $capacity = number_format($kwh, 2, '.', '');
                    $battery = $this->battery($capacity, $chemistry);
                    $kwhLabel = rtrim(rtrim($capacity, '0'), '.');
                    $nameEn = str_contains($trimEn, 'kWh') ? $trimEn : $trimEn.' '.$kwhLabel.' kWh';
                    $nameAr = str_contains($trimAr, 'ك.و.س') ? $trimAr : $trimAr.' '.$kwhLabel.' ك.و.س';

                    $this->upsert(VehicleVariant::query()->firstOrNew([
                        'vehicle_model_id' => $model->id,
                        'name_en' => $nameEn,
                        'market_version' => MarketVersion::from($market)->value,
                    ]), [
                        'name_ar' => $nameAr,
                        'trim' => $trimEn,
                        'year_from' => $from,
                        'year_to' => $to,
                        'battery_variant_id' => $battery->id,
                        'battery_capacity_kwh' => $capacity,
                        'ac_connector_type_id' => $ac ? $connectors[$ac] : null,
                        'dc_connector_type_id' => $dc ? $connectors[$dc] : null,
                        'motor_kw' => $motorKw,
                        'range_km_wltp' => $rangeKm,
                        'notes' => self::SPEC_NOTE,
                    ], ['is_active' => true, 'sort_order' => $variantOrder]);
                }
            }
        }
    }

    private function battery(string $capacity, string $chemistry): BatteryVariant
    {
        $label = rtrim(rtrim($capacity, '0'), '.');

        return BatteryVariant::query()->updateOrCreate(
            ['name' => $label.' kWh '.$chemistry],
            ['capacity_kwh' => $capacity, 'chemistry' => $chemistry, 'notes' => self::SPEC_NOTE],
        );
    }

    /**
     * updateOrCreate that refreshes descriptive columns but applies operator-owned columns
     * (is_active, sort_order) only when the row is created.
     *
     * @template TModel of \Illuminate\Database\Eloquent\Model
     *
     * @param  TModel  $model
     * @return TModel
     */
    private function upsert($model, array $values, array $onCreate)
    {
        $model->fill($values);
        if (! $model->exists) {
            $model->fill($onCreate);
        }
        if (! $model->exists || $model->isDirty()) {
            $model->save();
        }

        return $model;
    }
}
