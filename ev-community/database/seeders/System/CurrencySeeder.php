<?php

namespace Database\Seeders\System;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class CurrencySeeder extends Seeder
{
    public function run(): void
    {
        $rows = [
            ['code' => 'EGP', 'name_ar' => 'جنيه مصري', 'name_en' => 'Egyptian Pound', 'symbol' => 'ج.م', 'minor_units' => 2, 'is_base' => true],
            ['code' => 'USD', 'name_ar' => 'دولار أمريكي', 'name_en' => 'US Dollar', 'symbol' => '$', 'minor_units' => 2, 'is_base' => false],
            ['code' => 'CNY', 'name_ar' => 'يوان صيني', 'name_en' => 'Chinese Yuan', 'symbol' => '¥', 'minor_units' => 2, 'is_base' => false],
            ['code' => 'EUR', 'name_ar' => 'يورو', 'name_en' => 'Euro', 'symbol' => '€', 'minor_units' => 2, 'is_base' => false],
            ['code' => 'AED', 'name_ar' => 'درهم إماراتي', 'name_en' => 'UAE Dirham', 'symbol' => 'د.إ', 'minor_units' => 2, 'is_base' => false],
            ['code' => 'SAR', 'name_ar' => 'ريال سعودي', 'name_en' => 'Saudi Riyal', 'symbol' => 'ر.س', 'minor_units' => 2, 'is_base' => false],
        ];
        foreach ($rows as $row) {
            DB::table('currencies')->updateOrInsert(['code' => $row['code']], $row + ['is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        }
    }
}
