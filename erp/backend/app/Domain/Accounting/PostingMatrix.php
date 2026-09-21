<?php

namespace App\Domain\Accounting;

use App\Domain\Shared\DomainException;
use App\Models\Account;
use App\Models\PostingRule;

/**
 * مصفوفة الترحيل: تحدد الحساب لكل (نوع مستند × دور محاسبي).
 * تُعرَّف في قاعدة البيانات ويراجعها المحاسب المسؤول قبل التشغيل (is_reviewed).
 */
class PostingMatrix
{
    /** @var array<string, int> */
    private array $cache = [];

    /**
     * الأدوار المحاسبية القياسية لكل مستند — تُستخدم كبذرة أولية وكمرجع للتوثيق.
     *
     * @return array<string, array<int, string>>
     */
    public static function definition(): array
    {
        return [
            'goods_receipt' => ['inventory', 'grni'],
            'supplier_invoice' => ['grni', 'ap', 'tax_input', 'price_variance', 'inventory'],
            'purchase_return' => ['inventory', 'ap', 'tax_input'],
            'supplier_payment' => ['ap', 'cash', 'bank', 'cheque_payable'],
            'landed_cost' => ['inventory', 'cogs', 'ap', 'accrued_expense'],
            'sales_invoice' => ['ar', 'revenue', 'tax_output', 'delivery_income', 'cash'],
            'sales_invoice_cogs' => ['cogs', 'inventory', 'delivered_not_invoiced'],
            // إذن التسليم ينقل البضاعة من المخزون إلى «مسلّمة غير مفوترة»،
            // ثم تنقلها الفاتورة من هناك إلى تكلفة المبيعات. بلا هذه الخطوة
            // إما تُخصم التكلفة مرتين أو تبقى البضاعة في المخزون بعد خروجها.
            'delivery_note' => ['inventory', 'delivered_not_invoiced'],
            'sales_return' => ['sales_returns', 'ar', 'tax_output', 'cash'],
            'sales_return_cogs' => ['inventory', 'cogs'],
            'customer_receipt' => ['ar', 'custody_cash', 'cash', 'bank', 'cheque_receivable'],
            'cash_deposit' => ['custody_cash', 'cash', 'bank'],
            'expense' => ['expense', 'custody_cash', 'cash', 'bank'],
            'stock_adjustment' => ['inventory', 'inventory_loss', 'inventory_gain'],
            'variance_report' => ['inventory_loss', 'cash_shortage', 'custody_cash', 'inventory', 'staff_receivable'],
            'commission_settlement' => ['commission_expense', 'commission_payable'],
            'stock_transfer' => ['inventory', 'inventory_in_transit'],
        ];
    }

    public function account(int $companyId, string $docType, string $roleKey): Account
    {
        $cacheKey = "{$companyId}:{$docType}:{$roleKey}";

        if (isset($this->cache[$cacheKey])) {
            return Account::findOrFail($this->cache[$cacheKey]);
        }

        $rule = PostingRule::query()
            ->where('company_id', $companyId)
            ->where('doc_type', $docType)
            ->where('role_key', $roleKey)
            ->first();

        if (! $rule) {
            throw DomainException::make(
                'posting.rule_missing',
                "مصفوفة الترحيل غير مكتملة: لا يوجد حساب معرّف للدور «{$roleKey}» في مستند «{$docType}». راجع إعدادات الترحيل.",
                ['doc_type' => $docType, 'role_key' => $roleKey],
            );
        }

        $this->cache[$cacheKey] = (int) $rule->account_id;

        return $rule->account;
    }

    public function accountId(int $companyId, string $docType, string $roleKey): int
    {
        return (int) $this->account($companyId, $docType, $roleKey)->id;
    }

    /** هل راجع المحاسب كل قواعد الترحيل المطلوبة؟ */
    public function unreviewedRoles(int $companyId): array
    {
        return PostingRule::query()
            ->where('company_id', $companyId)
            ->where('is_reviewed', false)
            ->get(['doc_type', 'role_key'])
            ->map(fn ($r) => "{$r->doc_type}.{$r->role_key}")
            ->all();
    }
}
