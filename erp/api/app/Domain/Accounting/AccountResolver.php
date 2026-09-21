<?php

namespace App\Domain\Accounting;

use App\Exceptions\DomainException;
use App\Models\Account;
use App\Models\AccountMapping;
use App\Models\Bank;
use App\Models\CashBox;
use App\Models\CustodyAccount;
use App\Models\Customer;
use App\Models\Supplier;
use App\Support\CompanyContext;

/**
 * Turns the posting matrix's named hooks into concrete account IDs.
 *
 * Nothing in the domain hard-codes an account code. A company that renames or
 * renumbers its chart only edits account_mappings; the posting rules in
 * docs/04-posting-matrix.md stay valid.
 */
class AccountResolver
{
    /** Hooks the posting engine needs before the system can be used. */
    public const REQUIRED_KEYS = [
        'inventory', 'accounts_receivable', 'accounts_payable', 'sales_revenue',
        'sales_returns', 'sales_discount', 'cogs', 'vat_output', 'vat_input',
        'grni', 'inventory_adjustment', 'damage_expense', 'rounding_difference',
        'cash_on_hand', 'customer_advances', 'delivery_income', 'cheques_receivable',
    ];

    /** @var array<string, int> */
    protected array $cache = [];

    public function key(string $key): int
    {
        $companyId = CompanyContext::idOrFail();
        $cacheKey = "{$companyId}:{$key}";

        if (isset($this->cache[$cacheKey])) {
            return $this->cache[$cacheKey];
        }

        $accountId = AccountMapping::query()->where('key', $key)->value('account_id');

        if (! $accountId) {
            throw DomainException::make('gl.mapping_missing',
                "لم يتم ربط الحساب «{$key}» في إعدادات الترحيل. راجع شاشة مصفوفة الترحيل قبل التشغيل.",
                ['key' => $key]);
        }

        return $this->cache[$cacheKey] = (int) $accountId;
    }

    /** A customer's own control account, falling back to the shared AR account. */
    public function forCustomer(Customer|int $customer): int
    {
        $customer = $customer instanceof Customer ? $customer : Customer::findOrFail($customer);

        return $customer->gl_account_id ?: $this->key('accounts_receivable');
    }

    public function forSupplier(Supplier|int $supplier): int
    {
        $supplier = $supplier instanceof Supplier ? $supplier : Supplier::findOrFail($supplier);

        return $supplier->gl_account_id ?: $this->key('accounts_payable');
    }

    public function forCashBox(CashBox|int $cashBox): int
    {
        $cashBox = $cashBox instanceof CashBox ? $cashBox : CashBox::findOrFail($cashBox);

        if (! $cashBox->account_id) {
            throw DomainException::make('gl.cash_box_unmapped',
                "الخزنة «{$cashBox->name}» غير مرتبطة بحساب في دليل الحسابات.",
                ['cash_box_id' => $cashBox->id]);
        }

        return $cashBox->account_id;
    }

    public function forBank(Bank|int $bank): int
    {
        $bank = $bank instanceof Bank ? $bank : Bank::findOrFail($bank);

        if (! $bank->account_id) {
            throw DomainException::make('gl.bank_unmapped',
                "البنك «{$bank->name}» غير مرتبط بحساب في دليل الحسابات.",
                ['bank_id' => $bank->id]);
        }

        return $bank->account_id;
    }

    /**
     * A user's cash-custody account.
     *
     * Every collector has their own, so "what is with the reps right now" is a
     * real ledger balance and not a derived guess.
     */
    public function forCustody(int $userId, string $kind = 'cash'): int
    {
        $custody = CustodyAccount::query()
            ->where('user_id', $userId)
            ->where('kind', $kind)
            ->where('is_active', true)
            ->first();

        if ($custody) {
            return $custody->account_id;
        }

        /**
         * Cheques fall back to the company-level cheques-receivable account.
         * A cheque is company property whatever pocket it is in, and the rep is
         * recorded as the partner on the line — so per-rep cheque custody
         * accounts are an optional refinement, not a precondition for trading.
         * Cash has no such fallback: physical cash held by a person must be
         * attributable to that person.
         */
        if ($kind === 'cheque') {
            return $this->key('cheques_receivable');
        }

        throw DomainException::make('gl.custody_unmapped',
            'لا يوجد حساب عهدة نقدية مرتبط بهذا المستخدم. أنشئه من شاشة العهد قبل تسجيل التحصيل.',
            ['user_id' => $userId, 'kind' => $kind]);
    }

    /** Treasury containers addressed uniformly by the posting rules. */
    public function forTreasury(string $kind, int $id): int
    {
        return match ($kind) {
            'cash_box' => $this->forCashBox($id),
            'bank' => $this->forBank($id),
            'custody' => $this->forCustody($id),
            default => throw DomainException::make('gl.unknown_treasury_kind',
                "نوع خزينة غير معروف: {$kind}", compact('kind', 'id')),
        };
    }

    /** Which hooks are still unmapped — surfaced on the posting-matrix screen. */
    public function missingKeys(): array
    {
        $mapped = AccountMapping::query()->pluck('key')->all();

        return array_values(array_diff(self::REQUIRED_KEYS, $mapped));
    }

    public function isReady(): bool
    {
        return $this->missingKeys() === [];
    }

    public function flushCache(): void
    {
        $this->cache = [];
    }
}
