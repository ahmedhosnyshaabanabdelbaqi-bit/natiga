<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\Company;
use App\Models\FiscalPeriod;
use App\Models\FiscalYear;
use App\Models\PriceList;
use App\Models\Setting;
use App\Models\Uom;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;

/**
 * تهيئة شركة تشغيل: الفروع والسنة المالية والفترات والوحدات والمخازن والخزنة وقائمة الأسعار.
 * اسم النظام والشركة قابلان للتغيير من الإعدادات.
 */
class CompanySetupSeeder extends Seeder
{
    public function run(array $options = []): Company
    {
        $systemName = $options['system_name'] ?? config('erp.system_name');
        $companyName = $options['company_name'] ?? config('erp.company_name');
        $year = (int) ($options['year'] ?? now()->year);

        $company = Company::updateOrCreate(
            ['code' => $options['code'] ?? 'MAIN'],
            [
                'name_ar' => $companyName,
                'legal_name' => $companyName,
                'currency_code' => 'EGP',
                'timezone' => 'Africa/Cairo',
                'locale' => 'ar',
                'cost_method' => 'moving_average',
                'money_scale' => 2,
                'qty_scale' => 3,
                'is_active' => true,
            ],
        );

        foreach ([
            ['system_name', $systemName, 'branding', 'اسم النظام الظاهر في الواجهة والطباعة'],
            ['company_display_name', $companyName, 'branding', 'اسم الشركة في المستندات'],
            ['primary_color', '#0f766e', 'branding', 'اللون الأساسي للواجهة'],
            ['default_locale', 'ar', 'localization', 'اللغة الافتراضية'],
            ['rtl', true, 'localization', 'اتجاه الواجهة من اليمين لليسار'],
            ['cost_method', 'moving_average', 'inventory', 'طريقة تقييم المخزون المعتمدة'],
            ['allow_negative_stock', false, 'inventory', 'السماح بالمخزون السالب — ممنوع في التشغيل'],
            ['block_expired_sale', true, 'inventory', 'منع بيع الأصناف المنتهية'],
            ['fefo_enabled', true, 'inventory', 'الصرف بالأقرب انتهاءً'],
            ['credit_check_enabled', true, 'sales', 'تفعيل مراقبة الحد الائتماني'],
            ['offline_authorization_hours', 24, 'sync', 'مدة تفويض العمل دون اتصال بالساعات'],
            ['day_close_requires_sync', true, 'field', 'إقفال اليوم يتطلب اكتمال المزامنة'],
            ['rounding_policy', 'half_up', 'accounting', 'سياسة التقريب المعتمدة'],
            ['money_scale', 2, 'accounting', 'عدد الخانات العشرية للمبالغ'],
        ] as [$key, $value, $group, $description]) {
            Setting::updateOrCreate(
                ['company_id' => $company->id, 'key' => $key],
                ['value' => $value, 'group' => $group, 'description' => $description],
            );
        }

        $branch = Branch::updateOrCreate(
            ['company_id' => $company->id, 'code' => 'HQ'],
            ['name' => 'الفرع الرئيسي', 'is_active' => true],
        );

        // السنة المالية وفتراتها الشهرية
        $fiscalYear = FiscalYear::updateOrCreate(
            ['company_id' => $company->id, 'name' => (string) $year],
            ['start_date' => "{$year}-01-01", 'end_date' => "{$year}-12-31", 'status' => 'open'],
        );

        for ($month = 1; $month <= 12; $month++) {
            $start = sprintf('%d-%02d-01', $year, $month);
            $end = date('Y-m-t', strtotime($start));

            FiscalPeriod::updateOrCreate(
                ['company_id' => $company->id, 'fiscal_year_id' => $fiscalYear->id, 'name' => sprintf('%d-%02d', $year, $month)],
                ['start_date' => $start, 'end_date' => $end, 'status' => 'open'],
            );
        }

        // الوحدات
        foreach ([
            ['PCS', 'قطعة', 'count', false],
            ['BOX', 'علبة', 'count', false],
            ['DZN', 'دستة', 'count', false],
            ['CTN', 'كرتونة', 'count', false],
            ['PACK', 'عبوة', 'count', false],
            ['KG', 'كيلوجرام', 'weight', true],
            ['GM', 'جرام', 'weight', true],
            ['MTR', 'متر', 'length', true],
            ['ROLL', 'بكرة', 'length', false],
            ['LTR', 'لتر', 'volume', true],
        ] as [$code, $name, $dimension, $fraction]) {
            Uom::updateOrCreate(
                ['company_id' => $company->id, 'code' => $code],
                ['name_ar' => $name, 'dimension' => $dimension, 'allow_fraction' => $fraction],
            );
        }

        // المخازن الأساسية
        foreach ([
            ['MAIN', 'المخزن الرئيسي', 'main', true],
            ['TRANSIT', 'بضاعة بالطريق', 'transit', false],
            ['QUARANTINE', 'مخزن الحجر', 'quarantine', false],
            ['DAMAGED', 'مخزن التالف', 'damaged', false],
            ['RETURNS', 'مخزن المرتجعات تحت الفحص', 'returns', false],
        ] as [$code, $name, $type, $sellable]) {
            Warehouse::updateOrCreate(
                ['company_id' => $company->id, 'code' => $code],
                ['branch_id' => $branch->id, 'name' => $name, 'type' => $type, 'is_sellable' => $sellable, 'is_active' => true],
            );
        }

        // الخزنة الرئيسية
        $cashAccount = Account::where('company_id', $company->id)->where('code', '1101')->first();
        if ($cashAccount) {
            CashBox::updateOrCreate(
                ['company_id' => $company->id, 'code' => 'MAIN'],
                [
                    'branch_id' => $branch->id,
                    'account_id' => $cashAccount->id,
                    'name' => 'الخزنة الرئيسية',
                    'type' => 'company',
                    'currency_code' => 'EGP',
                ],
            );
        }

        // قوائم الأسعار
        foreach ([
            ['WHOLESALE', 'الجملة', 'wholesale', 10],
            ['HALF_WHOLESALE', 'نصف الجملة', 'half_wholesale', 20],
            ['RETAIL', 'القطاعي', 'retail', 30],
            ['DISTRIBUTOR', 'الموزعين', 'distributor', 40],
            ['PROJECT', 'المشروعات', 'project', 50],
        ] as [$code, $name, $type, $priority]) {
            PriceList::updateOrCreate(
                ['company_id' => $company->id, 'code' => $code],
                ['name' => $name, 'type' => $type, 'priority' => $priority, 'currency_code' => 'EGP', 'is_active' => true],
            );
        }

        return $company->fresh();
    }
}
