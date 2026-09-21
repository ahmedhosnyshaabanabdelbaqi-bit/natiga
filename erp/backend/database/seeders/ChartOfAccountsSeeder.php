<?php

namespace Database\Seeders;

use App\Domain\Accounting\PostingMatrix;
use App\Models\Account;
use App\Models\Company;
use App\Models\PostingRule;
use Illuminate\Database\Seeder;

/**
 * دليل حسابات افتراضي قابل للتخصيص + مصفوفة الترحيل.
 * القواعد تُنشأ غير مُراجَعة (is_reviewed = false) حتى يعتمدها المحاسب المسؤول.
 */
class ChartOfAccountsSeeder extends Seeder
{
    /**
     * [code, name_ar, type, nature, is_leaf, parent_code, control_type]
     */
    public static function accounts(): array
    {
        return [
            ['1', 'الأصول', 'asset', 'debit', false, null, 'none'],
            ['11', 'الأصول المتداولة', 'asset', 'debit', false, '1', 'none'],
            ['1101', 'النقدية بالخزائن', 'asset', 'debit', true, '11', 'cash'],
            ['1102', 'النقدية بالبنوك', 'asset', 'debit', true, '11', 'bank'],
            ['1103', 'عهد نقدية لدى المحصلين', 'asset', 'debit', true, '11', 'custody_cash'],
            ['1104', 'العملاء', 'asset', 'debit', true, '11', 'customers'],
            ['1105', 'أوراق القبض (شيكات تحت التحصيل)', 'asset', 'debit', true, '11', 'none'],
            ['1106', 'المخزون', 'asset', 'debit', true, '11', 'inventory'],
            ['1107', 'بضاعة بالطريق', 'asset', 'debit', true, '11', 'inventory'],
            ['1108', 'ضريبة القيمة المضافة — مدخلات', 'asset', 'debit', true, '11', 'tax'],
            ['1109', 'مدينون — موظفون', 'asset', 'debit', true, '11', 'none'],
            ['12', 'الأصول الثابتة', 'asset', 'debit', false, '1', 'none'],
            ['1201', 'سيارات ومعدات', 'asset', 'debit', true, '12', 'none'],

            ['2', 'الخصوم', 'liability', 'credit', false, null, 'none'],
            ['21', 'الخصوم المتداولة', 'liability', 'credit', false, '2', 'none'],
            ['2101', 'الموردون', 'liability', 'credit', true, '21', 'suppliers'],
            ['2102', 'بضاعة مستلمة غير مفوترة', 'liability', 'credit', true, '21', 'none'],
            ['2103', 'أوراق الدفع', 'liability', 'credit', true, '21', 'none'],
            ['2104', 'ضريبة القيمة المضافة — مخرجات', 'liability', 'credit', true, '21', 'tax'],
            ['2105', 'مصروفات مستحقة', 'liability', 'credit', true, '21', 'none'],
            ['2106', 'عمولات مستحقة للمناديب', 'liability', 'credit', true, '21', 'none'],
            ['2107', 'دفعات عملاء مقدمة', 'liability', 'credit', true, '21', 'customers'],

            ['3', 'حقوق الملكية', 'equity', 'credit', false, null, 'none'],
            ['3101', 'رأس المال', 'equity', 'credit', true, '3', 'none'],
            ['3102', 'الأرباح المرحّلة', 'equity', 'credit', true, '3', 'none'],

            ['4', 'الإيرادات', 'revenue', 'credit', false, null, 'none'],
            ['4101', 'المبيعات', 'revenue', 'credit', true, '4', 'none'],
            ['4102', 'مردودات ومسموحات المبيعات', 'revenue', 'debit', true, '4', 'none'],
            ['4103', 'إيرادات التوصيل', 'revenue', 'credit', true, '4', 'none'],
            ['4104', 'فروق جرد — زيادة', 'revenue', 'credit', true, '4', 'none'],

            ['5', 'التكاليف والمصروفات', 'expense', 'debit', false, null, 'none'],
            ['51', 'تكلفة المبيعات', 'expense', 'debit', false, '5', 'none'],
            ['5101', 'تكلفة البضاعة المباعة', 'expense', 'debit', true, '51', 'none'],
            ['52', 'المصروفات التشغيلية', 'expense', 'debit', false, '5', 'none'],
            ['5201', 'وقود وزيوت', 'expense', 'debit', true, '52', 'none'],
            ['5202', 'صيانة سيارات', 'expense', 'debit', true, '52', 'none'],
            ['5203', 'نقل وتحميل', 'expense', 'debit', true, '52', 'none'],
            ['5204', 'إيجارات', 'expense', 'debit', true, '52', 'none'],
            ['5205', 'أجور تشغيلية', 'expense', 'debit', true, '52', 'none'],
            ['5206', 'مصروفات تشغيلية أخرى', 'expense', 'debit', true, '52', 'none'],
            ['5207', 'عجز وتلف مخزني', 'expense', 'debit', true, '52', 'none'],
            ['5208', 'عجز نقدي', 'expense', 'debit', true, '52', 'none'],
            ['5209', 'عمولات مناديب', 'expense', 'debit', true, '52', 'none'],
            ['5210', 'فروق أسعار مشتريات', 'expense', 'debit', true, '52', 'none'],
        ];
    }

    /** خريطة الأدوار المحاسبية إلى أكواد الحسابات. */
    public static function roleAccountMap(): array
    {
        return [
            'inventory' => '1106',
            'inventory_in_transit' => '1107',
            'grni' => '2102',
            'ap' => '2101',
            'ar' => '1104',
            'cash' => '1101',
            'bank' => '1102',
            'custody_cash' => '1103',
            'cheque_receivable' => '1105',
            'cheque_payable' => '2103',
            'tax_input' => '1108',
            'tax_output' => '2104',
            'revenue' => '4101',
            'sales_returns' => '4102',
            'delivery_income' => '4103',
            'inventory_gain' => '4104',
            'cogs' => '5101',
            'expense' => '5206',
            'inventory_loss' => '5207',
            'cash_shortage' => '5208',
            'commission_expense' => '5209',
            'commission_payable' => '2106',
            'price_variance' => '5210',
            'accrued_expense' => '2105',
            'staff_receivable' => '1109',
        ];
    }

    public function run(?Company $company = null): void
    {
        $companies = $company ? collect([$company]) : Company::all();

        foreach ($companies as $c) {
            $byCode = [];

            foreach (self::accounts() as [$code, $name, $type, $nature, $isLeaf, $parentCode, $controlType]) {
                $account = Account::updateOrCreate(
                    ['company_id' => $c->id, 'code' => $code],
                    [
                        'parent_id' => $parentCode ? ($byCode[$parentCode] ?? null) : null,
                        'name_ar' => $name,
                        'type' => $type,
                        'nature' => $nature,
                        'is_leaf' => $isLeaf,
                        'control_type' => $controlType,
                        'level' => strlen($code),
                        'is_active' => true,
                    ],
                );
                $byCode[$code] = $account->id;
            }

            $map = self::roleAccountMap();
            $created = 0;

            foreach (PostingMatrix::definition() as $docType => $roles) {
                foreach ($roles as $role) {
                    if (! isset($map[$role], $byCode[$map[$role]])) {
                        continue;
                    }

                    PostingRule::updateOrCreate(
                        ['company_id' => $c->id, 'doc_type' => $docType, 'role_key' => $role],
                        [
                            'account_id' => $byCode[$map[$role]],
                            'notes' => 'قاعدة افتراضية — تحتاج مراجعة واعتماد المحاسب المسؤول قبل التشغيل.',
                        ],
                    );
                    $created++;
                }
            }

            $this->command?->info("الشركة {$c->name_ar}: ".count($byCode)." حسابًا و{$created} قاعدة ترحيل.");
        }
    }
}
