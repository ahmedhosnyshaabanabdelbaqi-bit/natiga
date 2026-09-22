<?php

namespace Database\Seeders\Geo;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class GeoSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('countries')->updateOrInsert(['code' => 'EG'], ['name_ar' => 'مصر', 'name_en' => 'Egypt', 'dial_code' => '+20', 'is_active' => true]);
        DB::table('countries')->updateOrInsert(['code' => 'CN'], ['name_ar' => 'الصين', 'name_en' => 'China', 'dial_code' => '+86', 'is_active' => true]);
        DB::table('countries')->updateOrInsert(['code' => 'AE'], ['name_ar' => 'الإمارات', 'name_en' => 'United Arab Emirates', 'dial_code' => '+971', 'is_active' => true]);
        DB::table('countries')->updateOrInsert(['code' => 'DE'], ['name_ar' => 'ألمانيا', 'name_en' => 'Germany', 'dial_code' => '+49', 'is_active' => true]);
        DB::table('countries')->updateOrInsert(['code' => 'US'], ['name_ar' => 'الولايات المتحدة', 'name_en' => 'United States', 'dial_code' => '+1', 'is_active' => true]);

        $governorates = [
            ['CAI', 'القاهرة', 'Cairo', 30.0444, 31.2357], ['GIZ', 'الجيزة', 'Giza', 30.0131, 31.2089], ['ALX', 'الإسكندرية', 'Alexandria', 31.2001, 29.9187],
            ['QAL', 'القليوبية', 'Qalyubia', 30.4100, 31.2100], ['SHR', 'الشرقية', 'Sharqia', 30.5877, 31.5020], ['DAK', 'الدقهلية', 'Dakahlia', 31.0409, 31.3785],
            ['GHR', 'الغربية', 'Gharbia', 30.7865, 31.0004], ['MNF', 'المنوفية', 'Monufia', 30.5972, 30.9876], ['BEH', 'البحيرة', 'Beheira', 30.8481, 30.3436],
            ['KFS', 'كفر الشيخ', 'Kafr El Sheikh', 31.1107, 30.9388], ['DAM', 'دمياط', 'Damietta', 31.4165, 31.8133], ['PTS', 'بورسعيد', 'Port Said', 31.2653, 32.3019],
            ['ISM', 'الإسماعيلية', 'Ismailia', 30.6043, 32.2723], ['SUZ', 'السويس', 'Suez', 29.9668, 32.5498], ['MAT', 'مطروح', 'Matrouh', 31.3543, 27.2373],
            ['FYM', 'الفيوم', 'Faiyum', 29.3084, 30.8428], ['BNS', 'بني سويف', 'Beni Suef', 29.0661, 31.0994], ['MNY', 'المنيا', 'Minya', 28.1099, 30.7503],
            ['ASY', 'أسيوط', 'Asyut', 27.1809, 31.1837], ['SHG', 'سوهاج', 'Sohag', 26.5569, 31.6948], ['QNA', 'قنا', 'Qena', 26.1551, 32.7160],
            ['LXR', 'الأقصر', 'Luxor', 25.6872, 32.6396], ['ASW', 'أسوان', 'Aswan', 24.0889, 32.8998], ['RSS', 'البحر الأحمر', 'Red Sea', 27.2579, 33.8116],
            ['WAD', 'الوادي الجديد', 'New Valley', 25.4514, 30.5464], ['SIN', 'شمال سيناء', 'North Sinai', 31.1316, 33.8009], ['JSN', 'جنوب سيناء', 'South Sinai', 28.5000, 33.9500],
        ];
        foreach ($governorates as $i => [$code, $ar, $en, $lat, $lng]) {
            DB::table('governorates')->updateOrInsert(['code' => $code], [
                'country_code' => 'EG', 'name_ar' => $ar, 'name_en' => $en, 'latitude' => $lat, 'longitude' => $lng, 'sort_order' => $i + 1, 'is_active' => true,
            ]);
        }
    }
}
