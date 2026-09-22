<?php

declare(strict_types=1);

namespace App\Modules\Customers\Services;

use App\Modules\Core\Services\PosContext;
use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Models\CustomerLedgerEntry;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Customer account (receivables).
 *
 * `customers.balance` is a projection of `customer_ledger_entries`; the ledger is
 * the reference and can rebuild it. Positive balance = the customer owes us.
 */
class CustomerLedgerService
{
    public function __construct(private readonly PosContext $context) {}

    public function debit(Customer $customer, Money $amount, string $type, ?Model $source = null, ?string $description = null, ?string $dueDate = null): CustomerLedgerEntry
    {
        return $this->post($customer, $amount, Money::zero(), $type, $source, $description, $dueDate);
    }

    public function credit(Customer $customer, Money $amount, string $type, ?Model $source = null, ?string $description = null): CustomerLedgerEntry
    {
        return $this->post($customer, Money::zero(), $amount, $type, $source, $description);
    }

    private function post(Customer $customer, Money $debit, Money $credit, string $type, ?Model $source, ?string $description, ?string $dueDate = null): CustomerLedgerEntry
    {
        // Lock the customer row so concurrent sales/collections cannot interleave
        // and produce a wrong running balance.
        $locked = Customer::query()->whereKey($customer->id)->lockForUpdate()->firstOrFail();

        $balanceAfter = Money::of($locked->balance)->plus($debit)->minus($credit)->quantize();

        $entry = CustomerLedgerEntry::query()->create([
            'customer_id' => $locked->id,
            'entry_date' => now()->toDateString(),
            'type' => $type,
            'source_type' => $source ? $source::class : null,
            'source_id' => $source?->getKey(),
            'debit' => $debit->toString(4),
            'credit' => $credit->toString(4),
            'balance_after' => $balanceAfter->toString(4),
            'due_date' => $dueDate,
            'description' => $description,
            'user_id' => $this->context->userId(),
        ]);

        $locked->forceFill(['balance' => $balanceAfter->toString(4)])->save();

        return $entry;
    }

    /**
     * Guard the credit limit BEFORE a credit sale is written.
     * A zero limit means "no credit allowed at all", not "unlimited".
     */
    public function assertCreditAllowed(Customer $customer, Money $additionalDebt): void
    {
        if (! $customer->allow_credit) {
            throw new InvalidOperationException(
                'هذا العميل غير مسموح له بالبيع الآجل.',
                'credit_not_allowed',
                422,
                ['customer_id' => $customer->id],
            );
        }

        $limit = Money::of($customer->credit_limit);
        if ($limit->isZero()) {
            return; // explicitly unlimited for this customer
        }

        $projected = Money::of($customer->balance)->plus($additionalDebt);

        if ($projected->isGreaterThan($limit)) {
            throw new InvalidOperationException(
                'تجاوز الحد الائتماني المسموح به للعميل.',
                'credit_limit_exceeded',
                422,
                [
                    'customer_id' => $customer->id,
                    'limit' => $limit->toString(),
                    'current_balance' => Money::of($customer->balance)->toString(),
                    'requested' => $additionalDebt->toString(),
                ],
            );
        }
    }

    /** Rebuild the projected balance from the ledger (used by reconciliation). */
    public function rebuildBalance(Customer $customer): Money
    {
        return DB::transaction(function () use ($customer): Money {
            $locked = Customer::query()->whereKey($customer->id)->lockForUpdate()->firstOrFail();

            $sum = CustomerLedgerEntry::query()
                ->where('customer_id', $locked->id)
                ->selectRaw('COALESCE(SUM(debit) - SUM(credit), 0) AS bal')
                ->value('bal');

            $balance = Money::of((string) $sum)->quantize();
            $locked->forceFill(['balance' => $balance->toString(4)])->save();

            return $balance;
        });
    }

    /** Oldest-first settlement of open invoices by a collected amount. */
    public function openInvoices(Customer $customer): Collection
    {
        return DB::table('sales')
            ->leftJoin('customer_payment_allocations as a', 'a.sale_id', '=', 'sales.id')
            ->leftJoin('sale_returns as r', function ($join) {
                $join->on('r.sale_id', '=', 'sales.id');
            })
            ->where('sales.customer_id', $customer->id)
            ->where('sales.is_credit', true)
            ->where('sales.status', 'completed')
            ->groupBy('sales.id', 'sales.number', 'sales.due_total', 'sales.sold_at', 'sales.due_date')
            ->havingRaw('sales.due_total - COALESCE(SUM(DISTINCT a.amount),0) - COALESCE(SUM(DISTINCT r.credit_applied),0) > 0')
            ->orderBy('sales.sold_at')
            ->get([
                'sales.id', 'sales.number', 'sales.due_total', 'sales.sold_at', 'sales.due_date',
                DB::raw('COALESCE(SUM(DISTINCT a.amount),0) AS allocated'),
                DB::raw('COALESCE(SUM(DISTINCT r.credit_applied),0) AS credited'),
            ]);
    }
}
