<?php

namespace Database\Seeders;

use Database\Seeders\Geo\GeoSeeder;
use Database\Seeders\Rbac\RbacSeeder;
use Database\Seeders\System\CurrencySeeder;
use Database\Seeders\System\ModuleSeeder;
use Database\Seeders\System\PolicySeeder;
use Illuminate\Database\Seeder;

/**
 * Master data only. Never seeds demo members, payments, orders or stations.
 * Demo data: `php artisan demo:seed` (blocked in production).
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RbacSeeder::class,
            CurrencySeeder::class,
            GeoSeeder::class,
            ModuleSeeder::class,
            PolicySeeder::class,
        ]);
        // Module master-data seeders (vehicle master data, connector types, categories...) register
        // themselves in database/seeders/<Module>/ and are called by MasterDataSeeder.
        if (class_exists(MasterDataSeeder::class)) {
            $this->call(MasterDataSeeder::class);
        }
    }
}
