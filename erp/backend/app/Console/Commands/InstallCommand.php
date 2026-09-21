<?php

namespace App\Console\Commands;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\CompanySetupSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * تثبيت النظام وإنشاء حساب الإدارة بإجراء آمن.
 *
 * كلمة المرور لا تُكتب في المستودع: تُولَّد عشوائيًا وتُعرض مرة واحدة،
 * أو تُقرأ من متغير البيئة ERP_ADMIN_PASSWORD، ويُطلب تغييرها عند أول دخول.
 */
class InstallCommand extends Command
{
    protected $signature = 'erp:install
        {--company-name= : اسم الشركة}
        {--system-name= : اسم النظام}
        {--admin-username=admin : اسم مستخدم المدير}
        {--admin-email= : بريد المدير}
        {--force : المتابعة حتى لو كان النظام مثبتًا}';

    protected $description = 'تهيئة قاعدة البيانات وإنشاء حساب الإدارة بإجراء آمن';

    public function handle(): int
    {
        if (User::query()->exists() && ! $this->option('force')) {
            $this->error('النظام مثبت بالفعل. استخدم --force لإعادة التهيئة.');

            return self::FAILURE;
        }

        $this->info('١/٥ تعريف الصلاحيات...');
        (new PermissionSeeder)->setCommand($this)->run();

        $this->info('٢/٥ تهيئة الشركة والفروع والفترات المالية...');
        $company = (new CompanySetupSeeder)->setCommand($this)->run([
            'company_name' => $this->option('company-name') ?: config('erp.company_name'),
            'system_name' => $this->option('system-name') ?: config('erp.system_name'),
        ]);

        $this->info('٣/٥ إنشاء دليل الحسابات ومصفوفة الترحيل...');
        (new ChartOfAccountsSeeder)->setCommand($this)->run($company);

        // إعادة تشغيل تهيئة الشركة لربط الخزنة بحساب النقدية بعد إنشاء الدليل
        (new CompanySetupSeeder)->setCommand($this)->run([
            'company_name' => $company->name_ar,
            'code' => $company->code,
        ]);

        $this->info('٤/٥ إنشاء الأدوار...');
        (new RoleSeeder)->setCommand($this)->run($company);

        $this->info('٥/٥ إنشاء حساب الإدارة...');
        $password = env('ERP_ADMIN_PASSWORD') ?: Str::password(16, true, true, false, false);
        $generated = ! env('ERP_ADMIN_PASSWORD');

        $admin = DB::transaction(function () use ($company, $password) {
            $user = User::updateOrCreate(
                ['username' => $this->option('admin-username')],
                [
                    'company_id' => $company->id,
                    'branch_id' => $company->branches()->value('id'),
                    'name' => 'مدير النظام',
                    'email' => $this->option('admin-email') ?: null,
                    'password' => $password,
                    'is_active' => true,
                    'is_super_admin' => true,
                    // إلزام تغيير كلمة المرور عند أول دخول
                    'must_change_password' => true,
                    'locale' => 'ar',
                ],
            );

            $ownerRole = Role::where('company_id', $company->id)->where('code', 'owner')->first();
            if ($ownerRole) {
                $user->roles()->syncWithoutDetaching([$ownerRole->id]);
            }

            return $user;
        });

        $this->newLine();
        $this->line(str_repeat('=', 64));
        $this->info('تم التثبيت بنجاح.');
        $this->line("النظام            : {$company->name_ar}");
        $this->line("اسم المستخدم      : {$admin->username}");

        if ($generated) {
            $this->line("كلمة المرور       : {$password}");
            $this->warn('هذه هي المرة الوحيدة التي تُعرض فيها كلمة المرور. غيّرها فور الدخول.');
        } else {
            $this->line('كلمة المرور       : (من متغير البيئة ERP_ADMIN_PASSWORD)');
        }

        $this->line(str_repeat('=', 64));
        $this->newLine();
        $this->warn('تنبيه: قواعد مصفوفة الترحيل أُنشئت افتراضيًا وتحتاج مراجعة واعتماد المحاسب المسؤول قبل التشغيل الفعلي.');

        return self::SUCCESS;
    }
}
