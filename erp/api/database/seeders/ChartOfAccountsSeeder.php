<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\AccountMapping;
use App\Models\Company;
use App\Models\FiscalPeriod;
use App\Models\FiscalYear;
use Illuminate\Database\Seeder;

/**
 * A starting chart of accounts and the posting-matrix mapping that makes the
 * engine operable.
 *
 * The codes here are a conventional starting point, not a legal requirement.
 * A company renumbers or renames freely — only the MAPPINGS matter to the
 * posting engine, and they are editable from the admin screens.
 */
class ChartOfAccountsSeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::query()->firstOrFail();

        foreach ($this->accounts() as [$code, $name, $type, $subtype, $parentCode, $postable]) {
            Account::updateOrCreate(
                ['company_id' => $company->id, 'code' => $code],
                [
                    'name' => $name,
                    'type' => $type,
                    'subtype' => $subtype,
                    'parent_id' => $parentCode
                        ? Account::where('company_id', $company->id)->where('code', $parentCode)->value('id')
                        : null,
                    'is_postable' => $postable,
                    'is_active' => true,
                ]
            );
        }

        foreach ($this->mappings() as $key => $code) {
            $accountId = Account::where('company_id', $company->id)->where('code', $code)->value('id');

            if ($accountId) {
                AccountMapping::updateOrCreate(
                    ['company_id' => $company->id, 'key' => $key],
                    ['account_id' => $accountId]
                );
            }
        }

        $this->seedFiscalCalendar($company);
    }

    protected function accounts(): array
    {
        // [code, name, type, subtype, parent_code, is_postable]
        return [
            ['1', 'الأصول', 'asset', null, null, false],
            ['11', 'الأصول المتداولة', 'asset', 'current', '1', false],
            ['1110', 'النقدية بالخزائن', 'asset', 'cash', '11', true],
            ['1120', 'النقدية بالبنوك', 'asset', 'bank', '11', false],
            ['1121', 'البنك الرئيسي', 'asset', 'bank', '1120', true],
            ['1130', 'عهد نقدية لدى المحصلين', 'asset', 'custody', '11', false],
            ['1140', 'شيكات تحت التحصيل', 'asset', 'cheques', '11', true],
            ['1200', 'العملاء', 'asset', 'receivable', '11', true],
            ['1210', 'أوراق قبض', 'asset', 'receivable', '11', true],
            ['1300', 'المخزون', 'asset', 'inventory', '11', false],
            ['1310', 'مخزون البضاعة', 'asset', 'inventory', '1300', true],
            ['1320', 'مخزون بالطريق', 'asset', 'inventory', '1300', true],
            ['1400', 'ضريبة القيمة المضافة — مدخلات', 'asset', 'tax', '11', true],
            ['1500', 'مصروفات مدفوعة مقدمًا', 'asset', 'prepaid', '11', true],

            ['2', 'الالتزامات', 'liability', null, null, false],
            ['21', 'الالتزامات المتداولة', 'liability', 'current', '2', false],
            ['2100', 'الموردون', 'liability', 'payable', '21', true],
            ['2110', 'بضاعة مستلمة غير مفوترة', 'liability', 'grni', '21', true],
            ['2120', 'أوراق دفع', 'liability', 'payable', '21', true],
            ['2200', 'ضريبة القيمة المضافة — مخرجات', 'liability', 'tax', '21', true],
            ['2300', 'دفعات مقدمة من العملاء', 'liability', 'advances', '21', true],
            ['2400', 'مصروفات مستحقة', 'liability', 'accrued', '21', true],
            ['2500', 'عمولات مستحقة', 'liability', 'accrued', '21', true],

            ['3', 'حقوق الملكية', 'equity', null, null, false],
            ['3100', 'رأس المال', 'equity', 'capital', '3', true],
            ['3200', 'أرباح مرحّلة', 'equity', 'retained', '3', true],

            ['4', 'الإيرادات', 'revenue', null, null, false],
            ['4100', 'إيرادات المبيعات', 'revenue', 'sales', '4', true],
            ['4110', 'إيرادات التوصيل', 'revenue', 'other', '4', true],
            ['4200', 'مرتجعات المبيعات', 'revenue', 'contra', '4', true],
            ['4210', 'خصم مسموح به', 'revenue', 'contra', '4', true],
            ['4900', 'إيرادات أخرى', 'revenue', 'other', '4', true],

            ['5', 'المصروفات', 'expense', null, null, false],
            ['5100', 'تكلفة البضاعة المباعة', 'expense', 'cogs', '5', true],
            ['5200', 'فروق تسويات المخزون', 'expense', 'inventory_variance', '5', true],
            ['5210', 'التالف والهالك', 'expense', 'inventory_variance', '5', true],
            ['53', 'مصروفات البيع والتوزيع', 'expense', 'selling', '5', false],
            ['5310', 'وقود وزيوت', 'expense', 'selling', '53', true],
            ['5320', 'صيانة سيارات', 'expense', 'selling', '53', true],
            ['5330', 'مصروفات نقل وتحميل', 'expense', 'selling', '53', true],
            ['5340', 'عمولات مناديب', 'expense', 'selling', '53', true],
            ['5350', 'مصروفات طريق', 'expense', 'selling', '53', true],
            ['54', 'مصروفات إدارية', 'expense', 'admin', '5', false],
            ['5410', 'رواتب وأجور', 'expense', 'admin', '54', true],
            ['5420', 'إيجارات', 'expense', 'admin', '54', true],
            ['5430', 'مرافق واتصالات', 'expense', 'admin', '54', true],
            ['5900', 'فروق تقريب', 'expense', 'other', '5', true],
        ];
    }

    /**
     * The posting matrix. Every key the engine can ask for is mapped here, so a
     * fresh install can post immediately; the accountant then reviews and
     * adjusts from the admin screen.
     */
    protected function mappings(): array
    {
        return [
            'inventory' => '1310',
            'inventory_in_transit' => '1320',
            'accounts_receivable' => '1200',
            'accounts_payable' => '2100',
            'sales_revenue' => '4100',
            'sales_returns' => '4200',
            'sales_discount' => '4210',
            'delivery_income' => '4110',
            'cogs' => '5100',
            'vat_output' => '2200',
            'vat_input' => '1400',
            'grni' => '2110',
            'inventory_adjustment' => '5200',
            'damage_expense' => '5210',
            'rounding_difference' => '5900',
            'cash_on_hand' => '1110',
            'cheques_receivable' => '1140',
            'customer_advances' => '2300',
            'commission_payable' => '2500',
            'commission_expense' => '5340',
        ];
    }

    /** An open fiscal year with monthly periods, so posting works from day one. */
    protected function seedFiscalCalendar(Company $company): void
    {
        $year = now()->year;
        $startMonth = $company->fiscal_year_start_month ?: 1;
        $start = \Illuminate\Support\Carbon::create($year, $startMonth, 1);
        $end = (clone $start)->addYear()->subDay();

        $fiscalYear = FiscalYear::updateOrCreate(
            ['company_id' => $company->id, 'code' => (string) $year],
            ['start_date' => $start->toDateString(), 'end_date' => $end->toDateString(), 'status' => 'open']
        );

        for ($i = 0; $i < 12; $i++) {
            $periodStart = (clone $start)->addMonths($i);
            $periodEnd = (clone $periodStart)->endOfMonth();

            FiscalPeriod::updateOrCreate(
                ['company_id' => $company->id, 'code' => $periodStart->format('Y-m')],
                [
                    'fiscal_year_id' => $fiscalYear->id,
                    'start_date' => $periodStart->toDateString(),
                    'end_date' => $periodEnd->toDateString(),
                    'status' => 'open',
                ]
            );
        }
    }
}
