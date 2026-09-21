<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Support\CompanyContext;
use Illuminate\Database\Seeder;

/**
 * Baseline install: permissions, company, chart of accounts, roles and an owner.
 *
 * Demo trading data lives in DemoDataSeeder and is NOT run here, so a
 * production install never gets fictional invoices in its ledger.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            PermissionSeeder::class,
            CompanySeeder::class,
        ]);

        CompanyContext::set(Company::query()->value('id'));

        $this->call([
            ChartOfAccountsSeeder::class,
            RoleSeeder::class,
            CatalogSeeder::class,
            OwnerSeeder::class,
        ]);
    }
}
