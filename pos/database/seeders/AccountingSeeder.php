<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Modules\Accounting\Models\Account;
use App\Modules\Accounting\Models\AccountMapping;
use App\Modules\Accounting\Services\PostingService;
use Illuminate\Database\Seeder;

/** Simplified chart of accounts, wired to the mapping keys the services use. */
class AccountingSeeder extends Seeder
{
    /** @var array<int, array{0:string,1:string,2:string,3:string|null}> code, name, type, parent */
    private array $accounts = [
        ['1', 'الأصول', 'asset', null],
        ['11', 'الأصول المتداولة', 'asset', '1'],
        ['1101', 'النقدية بالخزائن', 'asset', '11'],
        ['1102', 'النقدية بالبنوك', 'asset', '11'],
        ['1103', 'شبكات ومحافظ تحت التحصيل', 'asset', '11'],
        ['1110', 'العملاء (مدينون)', 'asset', '11'],
        ['1120', 'المخزون', 'asset', '11'],

        ['2', 'الخصوم', 'liability', null],
        ['2110', 'الموردون (دائنون)', 'liability', '2'],
        ['2120', 'ضريبة القيمة المضافة المستحقة', 'liability', '2'],

        ['3', 'حقوق الملكية', 'equity', null],
        ['3100', 'رأس المال', 'equity', '3'],

        ['4', 'الإيرادات', 'revenue', null],
        ['4100', 'إيرادات المبيعات', 'revenue', '4'],
        ['4110', 'مرتجعات المبيعات', 'revenue', '4'],
        ['4120', 'خصومات المبيعات', 'revenue', '4'],
        ['4900', 'فروق التقريب', 'revenue', '4'],

        ['5', 'المصروفات', 'expense', null],
        ['5100', 'تكلفة البضاعة المباعة', 'expense', '5'],
        ['5200', 'مصروفات تشغيلية', 'expense', '5'],
        ['5300', 'عجز وزيادة الخزنة', 'expense', '5'],
        ['5400', 'فروق الجرد', 'expense', '5'],
    ];

    /** @var array<string,string> mapping key => account code */
    private array $mappings = [
        PostingService::CASH => '1101',
        PostingService::CARD_CLEARING => '1103',
        PostingService::ACCOUNTS_RECEIVABLE => '1110',
        PostingService::INVENTORY => '1120',
        PostingService::ACCOUNTS_PAYABLE => '2110',
        PostingService::TAX_PAYABLE => '2120',
        PostingService::SALES_REVENUE => '4100',
        PostingService::SALES_RETURNS => '4110',
        PostingService::SALES_DISCOUNT => '4120',
        PostingService::ROUNDING => '4900',
        PostingService::COGS => '5100',
        PostingService::EXPENSE => '5200',
        PostingService::CASH_VARIANCE => '5300',
        PostingService::INVENTORY_VARIANCE => '5400',
    ];

    public function run(): void
    {
        $byCode = [];

        foreach ($this->accounts as [$code, $name, $type, $parent]) {
            $account = Account::query()->updateOrCreate(
                ['code' => $code],
                [
                    'name' => $name,
                    'type' => $type,
                    'parent_id' => $parent ? ($byCode[$parent]->id ?? null) : null,
                    // Only leaf accounts accept postings.
                    'is_postable' => strlen($code) > 2,
                    'is_active' => true,
                ],
            );
            $byCode[$code] = $account;
        }

        foreach ($this->mappings as $key => $code) {
            AccountMapping::query()->updateOrCreate(
                ['key' => $key],
                ['account_id' => $byCode[$code]->id],
            );
        }

        app(PostingService::class)->flush();
    }
}
