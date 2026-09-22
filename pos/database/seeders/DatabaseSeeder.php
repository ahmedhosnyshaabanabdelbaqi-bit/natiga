<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Production-safe baseline. Demo catalogue data lives in DemoDataSeeder and is
 * never run automatically — see `php artisan db:seed --class=DemoDataSeeder`.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            PermissionSeeder::class,
            AccountingSeeder::class,
            BaseSetupSeeder::class,
        ]);
    }
}
