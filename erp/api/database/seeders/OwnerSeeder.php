<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * The first administrator.
 *
 * Credentials come from the environment so a deployment never ships a password
 * that is written down in a repository. The account is forced to change its
 * password on first login.
 */
class OwnerSeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::query()->firstOrFail();

        $email = env('ERP_OWNER_EMAIL', 'owner@example.test');
        $password = env('ERP_OWNER_PASSWORD');

        if (! $password) {
            $password = \Illuminate\Support\Str::password(16);
            $this->command?->warn("تم توليد كلمة مرور للمالك: {$password}");
            $this->command?->warn('غيّرها فورًا بعد أول تسجيل دخول، أو اضبط ERP_OWNER_PASSWORD قبل التشغيل.');
        }

        $user = User::updateOrCreate(
            ['email' => $email],
            [
                'company_id' => $company->id,
                'name' => env('ERP_OWNER_NAME', 'مالك النظام'),
                'password' => $password,
                'is_super_admin' => true,
                'is_active' => true,
                'must_change_password' => true,
                'locale' => 'ar',
            ]
        );

        if ($role = Role::query()->where('code', 'company_admin')->first()) {
            $user->roles()->syncWithoutDetaching([$role->id]);
        }
    }
}
