<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(PermissionSeeder::class);

        $company = (new CompanySetupSeeder)->setCommand($this->command)->run();
        (new ChartOfAccountsSeeder)->setCommand($this->command)->run($company);
        (new CompanySetupSeeder)->setCommand($this->command)->run(['code' => $company->code, 'company_name' => $company->name_ar]);
        (new RoleSeeder)->setCommand($this->command)->run($company);
    }
}
