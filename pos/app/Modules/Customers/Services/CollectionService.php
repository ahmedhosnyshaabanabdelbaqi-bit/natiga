<?php

declare(strict_types=1);

namespace App\Modules\Customers\Services;

use App\Modules\Access\Services\AuditService;
use App\Modules\Accounting\Services\PostingService;
use App\Modules\Cash\Models\PaymentMethod;
use App\Modules\Cash\Services\CashService;
use App\Modules\Core\Services\BusinessCalendar;
use App\Modules\Core\Services\PosContext;
use App\Modules\Core\Services\SequenceService;
use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Models\CustomerPayment;
use App\Modules\Customers\Models\CustomerPaymentAllocation;
use App\Modules\Sales\Models\Sale;
use App\Modules\Sync\Services\IdempotencyService;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use Illuminate\Support\Facades\DB;

/**
 * Collecting money against customer debt.
 *
 * A collection is recorded as a `collection` cash movement — never as a sale —
 * so the same pound is not counted once in sales and again in collections.
 * Unallocated money settles the oldest open invoices first.
 */
class CollectionService
{
    public function __construct(
        private readonly CustomerLedgerService $ledger,
        private readonly CashService $cash,
        private readonly PostingService $posting,
        private readonly SequenceService $sequences,
        private readonly BusinessCalendar $calendar,
        private readonly AuditService $audit,
        private readonly IdempotencyService $idempotency,
        private readonly PosContext $context,
    ) {}

    /**
     * @param array{customer_id:int, payment_method_id:int, amount:string, reference?:string|null,
     *              allocations?:list<array{sale_id:int, amount:string}>, notes?:string|null,
     *              idempotency_key?:string|null} $input
     * @return array{response: array<string,mixed>, replayed: bool}
     */
    public function collect(array $input): array
    {
        return $this->idempotency->execute(
            'collection',
            $input['idempotency_key'] ?? null,
            ['customer_id' => $input['customer_id'], 'amount' => $input['amount'], 'method' => $input['payment_method_id']],
            function () use ($input): array {
                $payment = DB::transaction(fn () => $this->performCollection($input));

                return ['model' => $payment, 'response' => $this->present($payment)];
            },
        );
    }

    private function performCollection(array $input): CustomerPayment
    {
        $customer = Customer::query()->findOrFail($input['customer_id']);
        $method = PaymentMethod::query()->where('is_active', true)->findOrFail($input['payment_method_id']);
        $amount = Money::of($input['amount'])->quantize();

        if (! $amount->isPositive()) {
            throw new InvalidOperationException('قيمة التحصيل يجب أن تكون أكبر من صفر.', 'invalid_collection_amount');
        }

        $outstanding = Money::of($customer->balance);
        if ($amount->isGreaterThan($outstanding)) {
            throw new InvalidOperationException(
                'قيمة التحصيل تتجاوز مديونية العميل.',
                'collection_exceeds_debt',
                422,
                ['balance' => $outstanding->toString(), 'amount' => $amount->toString()],
            );
        }

        $shift = $this->context->shift();

        $payment = CustomerPayment::query()->create([
            'number' => $this->sequences->next('customer_payment'),
            'customer_id' => $customer->id,
            'payment_method_id' => $method->id,
            'branch_id' => $this->context->branchId(),
            'shift_id' => $shift?->id,
            'terminal_id' => $this->context->terminalId(),
            'amount' => $amount->toString(4),
            'paid_at' => now(),
            'business_date' => $this->calendar->businessDate(),
            'reference' => $input['reference'] ?? null,
            'user_id' => $this->context->userId(),
            'idempotency_key' => $input['idempotency_key'] ?? null,
            'notes' => $input['notes'] ?? null,
        ]);

        $allocations = $input['allocations'] ?? $this->autoAllocate($customer, $amount);
        $allocated = Money::zero();

        foreach ($allocations as $allocation) {
            $allocAmount = Money::of($allocation['amount'])->quantize();
            if (! $allocAmount->isPositive()) {
                continue;
            }

            $sale = Sale::query()->whereKey($allocation['sale_id'])->where('customer_id', $customer->id)->firstOrFail();
            $remaining = $sale->outstanding();

            if ($allocAmount->isGreaterThan($remaining)) {
                throw new InvalidOperationException(
                    'التوزيع يتجاوز المتبقي على الفاتورة.',
                    'allocation_exceeds_invoice',
                    422,
                    ['sale_number' => $sale->number, 'remaining' => $remaining->toString()],
                );
            }

            CustomerPaymentAllocation::query()->create([
                'customer_payment_id' => $payment->id,
                'sale_id' => $sale->id,
                'amount' => $allocAmount->toString(4),
            ]);

            $allocated = $allocated->plus($allocAmount);
        }

        if ($allocated->isGreaterThan($amount)) {
            throw new InvalidOperationException('مجموع التوزيع يتجاوز المبلغ المحصل.', 'allocation_exceeds_payment', 422);
        }

        $this->ledger->credit($customer, $amount, 'payment', $payment, 'تحصيل رقم '.$payment->number);

        if ($method->affects_drawer) {
            if (! $shift) {
                throw new InvalidOperationException('لا توجد وردية مفتوحة لتسجيل التحصيل النقدي.', 'shift_required', 409);
            }
            $account = $this->cash->drawerForTerminal((int) $this->context->terminalId(), (int) $this->context->branchId());
            $this->cash->record($account, $shift, CashService::TYPE_COLLECTION, $amount, $payment, 'تحصيل من '.$customer->name);
        }

        $this->posting->post('collection', $payment, [
            ['account' => $method->affects_drawer ? PostingService::CASH : PostingService::CARD_CLEARING, 'debit' => $amount, 'memo' => 'تحصيل'],
            ['account' => PostingService::ACCOUNTS_RECEIVABLE, 'credit' => $amount, 'memo' => 'تخفيض مديونية '.$customer->name],
        ], 'تحصيل من عميل '.$payment->number, $payment->business_date->toDateString());

        $this->audit->log('collection.recorded', $payment, null, [
            'customer' => $customer->name,
            'amount' => $amount->toString(),
            'method' => $method->code,
        ]);

        return $payment->refresh();
    }

    /** @return list<array{sale_id:int, amount:string}> Oldest invoice first. */
    private function autoAllocate(Customer $customer, Money $amount): array
    {
        $remaining = $amount;
        $out = [];

        foreach ($this->ledger->openInvoices($customer) as $row) {
            if (! $remaining->isPositive()) {
                break;
            }

            $open = Money::of((string) $row->due_total)
                ->minus(Money::of((string) $row->allocated))
                ->minus(Money::of((string) $row->credited));

            if (! $open->isPositive()) {
                continue;
            }

            $take = $open->isLessThan($remaining) ? $open : $remaining;
            $out[] = ['sale_id' => (int) $row->id, 'amount' => $take->toString()];
            $remaining = $remaining->minus($take);
        }

        return $out;
    }

    /** @return array<string,mixed> */
    public function present(CustomerPayment $payment): array
    {
        $payment->loadMissing('allocations');

        return [
            'id' => $payment->id,
            'number' => $payment->number,
            'customer_id' => $payment->customer_id,
            'amount' => $payment->amount,
            'paid_at' => $payment->paid_at?->toIso8601String(),
            'allocations' => $payment->allocations->map(fn ($a) => [
                'sale_id' => $a->sale_id,
                'amount' => $a->amount,
            ])->all(),
        ];
    }
}
