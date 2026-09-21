<?php

namespace Tests;

use App\Models\Company;
use App\Models\Role;
use App\Models\User;
use App\Support\CompanyContext;
use Database\Seeders\CatalogSeeder;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\CompanySeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    use RefreshDatabase;

    protected Company $company;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([
            PermissionSeeder::class,
            CompanySeeder::class,
        ]);

        $this->company = Company::query()->firstOrFail();
        CompanyContext::set($this->company->id);

        $this->seed([
            ChartOfAccountsSeeder::class,
            RoleSeeder::class,
            CatalogSeeder::class,
        ]);
    }

    protected function tearDown(): void
    {
        CompanyContext::clear();
        parent::tearDown();
    }

    /** A user carrying exactly the named role, for permission-boundary tests. */
    protected function userWithRole(string $roleCode, array $attributes = []): User
    {
        $user = User::factory()->create(array_merge([
            'company_id' => $this->company->id,
        ], $attributes));

        if ($role = Role::query()->where('code', $roleCode)->first()) {
            $user->roles()->sync([$role->id]);
        }

        return $user->fresh('roles');
    }

    protected function superAdmin(): User
    {
        return User::factory()->create([
            'company_id' => $this->company->id,
            'is_super_admin' => true,
        ]);
    }
}
