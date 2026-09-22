<?php

declare(strict_types=1);

namespace App\Modules\Sales\Services;

use App\Modules\Access\Services\ApprovalService;
use App\Modules\Access\Services\AuditService;
use App\Modules\Access\Services\PermissionService;
use App\Modules\Accounting\Services\PostingService;
use App\Modules\Cash\Models\PaymentMethod;
use App\Modules\Cash\Services\CashService;
use App\Modules\Catalog\Services\SerialService;
use App\Modules\Core\Models\Warehouse;
use App\Modules\Core\Services\BusinessCalendar;
use App\Modules\Core\Services\PosContext;
use App\Modules\Core\Services\SequenceService;
use App\Modules\Core\Services\SettingsService;
use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Services\CustomerLedgerService;
use App\Modules\Inventory\Services\InventoryService;
use App\Modules\Sales\Models\Sale;
use App\Modules\Sales\Models\SaleLine;
use App\Modules\Sales\Models\SaleLineSerial;
use App\Modules\Sales\Models\SaleReturn;
use App\Modules\Sales\Models\SaleReturnLine;
use App\Modules\Sales\Models\SaleReturnLineSerial;
use App\Modules\Sync\Services\IdempotencyService;
use App\Modules\Sync\Services\OutboxService;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Sales returns and exchanges.
 *
 * Rules that this class exists to guarantee:
 *  - a return is valued from the ORIGINAL invoice line (its price, its share of
 *    both the line and the invoice discount, its tax) — never from today's price;
 *  - the cost reversed is the cost that was actually charged to COGS on the sale,
 *    not the current purchase price;
 *  - the returned quantity can never exceed what is still returnable, even when
 *    two returns are posted at the same instant (atomic conditional UPDATE, with
 *    a CHECK constraint as a second line of defence);
 *  - a returned item does not automatically become sellable again: the cashier
 *    picks a disposition and non-resalable goods go to a quarantine warehouse;
 *  - on a credit invoice the debt is reduced BEFORE any cash is handed over, and
 *    never more than the customer is actually owed.
 */
class ReturnService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly SerialService $serials,
        private readonly CashService $cash,
        private readonly CustomerLedgerService $ledger,
        private readonly PostingService $posting,
        private readonly SequenceService $sequences,
        private readonly BusinessCalendar $calendar,
        private readonly SettingsService $settings,
        private readonly PermissionService $permissions,
        private readonly ApprovalService $approvals,
        private readonly AuditService $audit,
        private readonly IdempotencyService $idempotency,
        private readonly OutboxService $outbox,
        private readonly PosContext $context,
    ) {}

    /**
     * @param array{sale_id:int, lines:list<array{sale_line_id:int, qty:string, disposition?:string, serials?:list<string>}>,
     *              reason?:string, refund_method_id?:int|null, idempotency_key?:string|null,
     *              approval_uuid?:string|null} $input
     * @return array{response: array<string,mixed>, replayed: bool}
     */
    public function process(array $input): array
    {
        return $this->idempotency->execute(
            'sale_return',
            $input['idempotency_key'] ?? null,
            ['sale_id' => $input['sale_id'] ?? null, 'lines' => $input['lines'] ?? []],
            function () use ($input): array {
                $return = DB::transaction(fn () => $this->performReturn($input), 3);

                return ['model' => $return, 'response' => $this->present($return)];
            },
        );
    }

    private function performReturn(array $input): SaleReturn
    {
        $user = $this->context->user();
        $this->permissions->authorize($user, 'sales.return', $this->context->branchId());

        $terminal = $this->context->terminal();
        $shift = $this->context->shift();

        $sale = Sale::query()->with('lines')->findOrFail($input['sale_id']);

        if ($sale->status !== Sale::STATUS_COMPLETED) {
            throw new InvalidOperationException('لا يمكن الارتجاع من فاتورة غير معتمدة.', 'sale_not_returnable', 422);
        }

        $sellableWarehouse = Warehouse::query()->findOrFail($sale->warehouse_id);
        $quarantine = $this->quarantineWarehouse((int) $sale->branch_id);

        $return = SaleReturn::query()->create([
            'uuid' => (string) Str::uuid7(),
            'number' => $this->sequences->next('sale_return', $terminal?->code ?? 'HQ'),
            'sale_id' => $sale->id,
            'branch_id' => $sale->branch_id,
            'warehouse_id' => $sale->warehouse_id,
            'terminal_id' => $terminal?->id,
            'shift_id' => $shift?->id,
            'user_id' => $user->id,
            'customer_id' => $sale->customer_id,
            'returned_at' => now(),
            'business_date' => $this->calendar->businessDate(),
            'reason' => $input['reason'] ?? null,
            'idempotency_key' => $input['idempotency_key'] ?? null,
            'status' => 'completed',
        ]);

        $subtotal = Money::zero();
        $discountTotal = Money::zero();
        $taxTotal = Money::zero();
        $grandTotal = Money::zero();
        $costTotal = Money::zero();

        foreach ($input['lines'] as $lineInput) {
            $result = $this->returnOneLine(
                $return,
                $sale,
                $lineInput,
                $sellableWarehouse,
                $quarantine,
            );

            $subtotal = $subtotal->plus($result['gross']);
            $discountTotal = $discountTotal->plus($result['discount']);
            $taxTotal = $taxTotal->plus($result['tax']);
            $grandTotal = $grandTotal->plus($result['total']);
            $costTotal = $costTotal->plus($result['cost']);
        }

        if ($grandTotal->isZero()) {
            throw new InvalidOperationException('لا توجد بنود صالحة للارتجاع.', 'empty_return', 422);
        }

        // ---- settlement: debt first, then money ------------------------------
        $settlement = $this->settle($sale, $return, $grandTotal, $input['refund_method_id'] ?? null, $shift);

        $return->forceFill([
            'subtotal' => $subtotal->toString(4),
            'discount_total' => $discountTotal->toString(4),
            'tax_total' => $taxTotal->toString(4),
            'grand_total' => $grandTotal->toString(4),
            'cost_total' => $costTotal->toString(4),
            'refund_cash' => $settlement['cash']->toString(4),
            'refund_other' => $settlement['other']->toString(4),
            'credit_applied' => $settlement['credit']->toString(4),
        ])->save();

        DB::update(
            'UPDATE sales SET refunded_total = refunded_total + ?, updated_at = now() WHERE id = ?',
            [$grandTotal->toString(4), $sale->id],
        );

        $this->postToLedger($return, $grandTotal, $taxTotal, $costTotal, $settlement);

        $this->audit->log('sale_return.completed', $return, null, [
            'number' => $return->number,
            'sale_number' => $sale->number,
            'grand_total' => $grandTotal->toString(),
            'refund_cash' => $settlement['cash']->toString(),
            'credit_applied' => $settlement['credit']->toString(),
        ], $input['reason'] ?? null);

        $this->outbox->publish('sale_return.completed', [
            'sale_return_id' => $return->id,
            'number' => $return->number,
            'terminal_id' => $terminal?->id,
            'print' => true,
        ]);

        return $return->refresh();
    }

    /**
     * @param  array{sale_line_id:int, qty:string, disposition?:string, serials?:list<string>}  $input
     * @return array{gross:Money, discount:Money, tax:Money, total:Money, cost:Money}
     */
    private function returnOneLine(SaleReturn $return, Sale $sale, array $input, Warehouse $sellable, ?Warehouse $quarantine): array
    {
        /** @var SaleLine $line */
        $line = SaleLine::query()->whereKey($input['sale_line_id'])->where('sale_id', $sale->id)->firstOrFail();

        $qty = Quantity::of($input['qty']);
        if (! $qty->isPositive()) {
            throw new InvalidOperationException('كمية المرتجع يجب أن تكون أكبر من صفر.', 'invalid_return_qty', 422);
        }

        $qtyBase = $qty->multipliedBy((string) $line->unit_factor);

        /*
         * Atomic claim of the returnable quantity. Two simultaneous returns for
         * the same line cannot both succeed: the second UPDATE matches zero rows
         * because the WHERE clause re-evaluates the already-incremented total.
         */
        $claimed = DB::update(
            'UPDATE sale_lines
                SET returned_qty_base = returned_qty_base + ?, updated_at = now()
              WHERE id = ? AND returned_qty_base + ? <= qty_base',
            [$qtyBase->toString(), $line->id, $qtyBase->toString()],
        );

        if ($claimed === 0) {
            $line->refresh();
            throw new InvalidOperationException(
                'الكمية المطلوب إرجاعها تتجاوز المتاح من هذا البند.',
                'return_exceeds_sold',
                422,
                [
                    'sale_line_id' => $line->id,
                    'sold' => $line->qty_base,
                    'already_returned' => $line->returned_qty_base,
                    'requested' => $qtyBase->toString(),
                ],
            );
        }

        // ---- value it from the ORIGINAL invoice ------------------------------
        $unitNet = $line->effectiveUnitNet();
        $unitTax = $line->effectiveUnitTax();
        $unitTotal = $line->effectiveUnitTotal();

        $net = $unitNet->multipliedBy($qtyBase)->quantize();
        $tax = $unitTax->multipliedBy($qtyBase)->quantize();
        $total = $unitTotal->multipliedBy($qtyBase)->quantize();

        $unitGross = Money::of($line->gross_amount)->dividedBy(Quantity::of($line->qty_base));
        $gross = $unitGross->multipliedBy($qtyBase)->quantize();
        $discountShare = $gross->minus($net);

        // ---- cost reversed at the ORIGINAL cost of goods sold ----------------
        $unitCost = Money::of($line->unit_cost);
        $cost = $unitCost->multipliedBy($qtyBase)->quantize();

        $disposition = $input['disposition'] ?? 'resalable';
        $destination = $this->destinationFor($disposition, $sellable, $quarantine);

        $returnLine = SaleReturnLine::query()->create([
            'sale_return_id' => $return->id,
            'sale_line_id' => $line->id,
            'product_id' => $line->product_id,
            'variant_id' => $line->variant_id,
            'product_unit_id' => $line->product_unit_id,
            'batch_id' => $line->batch_id,
            'product_name' => $line->product_name,
            'unit_name' => $line->unit_name,
            'unit_factor' => $line->unit_factor,
            'qty' => $qty->toString(),
            'qty_base' => $qtyBase->toString(),
            'unit_price' => $line->unit_price,
            'discount_share' => $discountShare->toString(4),
            'net_amount' => $net->toString(4),
            'tax_rate' => $line->tax_rate,
            'tax_amount' => $tax->toString(4),
            'total_amount' => $total->toString(4),
            'unit_cost' => $unitCost->toString(6),
            'cost_amount' => $cost->toString(4),
            'disposition' => $disposition,
            'destination_warehouse_id' => $destination?->id,
        ]);

        $product = $line->product;

        if ($product->isStocked() && $destination) {
            $this->inventory->record(
                warehouseId: $destination->id,
                variant: $line->variant,
                qtyBase: $qtyBase,
                reason: InventoryService::REASON_SALE_RETURN,
                unitCost: $unitCost,
                sourceType: SaleReturn::class,
                sourceId: $return->id,
                sourceLineId: $returnLine->id,
                productUnitId: $line->product_unit_id,
                enteredQty: $qty,
                batchId: $line->batch_id,
                note: 'مرتجع مبيعات — '.$disposition,
            );
        }

        // ---- serials ----------------------------------------------------------
        foreach ($input['serials'] ?? [] as $serialValue) {
            $link = SaleLineSerial::query()
                ->where('sale_line_id', $line->id)
                ->where('serial', $serialValue)
                ->where('returned', false)
                ->first();

            if (! $link) {
                throw new InvalidOperationException(
                    'الرقم التسلسلي غير مباع على هذا البند أو سبق إرجاعه.',
                    'serial_not_on_line',
                    422,
                    ['serial' => $serialValue],
                );
            }

            $link->forceFill(['returned' => true])->save();

            SaleReturnLineSerial::query()->create([
                'sale_return_line_id' => $returnLine->id,
                'serial_id' => $link->serial_id,
                'serial' => $serialValue,
            ]);

            $this->serials->markReturned(
                $link->serialRecord,
                $destination?->id ?? $sellable->id,
                $disposition === 'resalable',
            );
        }

        return ['gross' => $gross, 'discount' => $discountShare, 'tax' => $tax, 'total' => $total, 'cost' => $cost];
    }

    /**
     * Settle the refund.
     *
     * On a credit invoice the outstanding debt is cleared FIRST — a customer who
     * still owes 600 on a 1000 invoice and returns goods worth 400 gets no cash,
     * their debt drops to 200. Only value beyond the outstanding debt is refunded
     * in money, and never more than the customer actually paid.
     *
     * @return array{cash:Money, other:Money, credit:Money}
     */
    private function settle(Sale $sale, SaleReturn $return, Money $amount, ?int $refundMethodId, $shift): array
    {
        $credit = Money::zero();
        $remaining = $amount;

        if ($sale->is_credit) {
            $outstanding = $sale->outstanding();
            if ($outstanding->isPositive()) {
                $credit = $outstanding->isLessThan($remaining) ? $outstanding : $remaining;
                $remaining = $remaining->minus($credit);

                $customer = Customer::query()->findOrFail($sale->customer_id);
                $this->ledger->credit($customer, $credit, 'return', $return, 'مرتجع فاتورة '.$sale->number);
            }
        }

        if ($remaining->isZero()) {
            return ['cash' => Money::zero(), 'other' => Money::zero(), 'credit' => $credit];
        }

        // Refund in money. Default to the drawer; a non-cash method is recorded
        // as `refund_other` and does not touch the till.
        $method = $refundMethodId
            ? PaymentMethod::query()->find($refundMethodId)
            : null;

        $useCash = $method === null || (bool) $method->affects_drawer;

        if ($useCash) {
            if (! $shift) {
                throw new InvalidOperationException('لا توجد وردية مفتوحة لصرف المرتجع النقدي.', 'shift_required', 409);
            }
            $account = $this->cash->drawerForTerminal((int) $return->terminal_id, (int) $return->branch_id);
            $this->cash->record($account, $shift, CashService::TYPE_REFUND, $remaining->negated(), $return, 'مرتجع نقدي '.$return->number);

            return ['cash' => $remaining, 'other' => Money::zero(), 'credit' => $credit];
        }

        return ['cash' => Money::zero(), 'other' => $remaining, 'credit' => $credit];
    }

    /** @param array{cash:Money, other:Money, credit:Money} $settlement */
    private function postToLedger(SaleReturn $return, Money $grandTotal, Money $taxTotal, Money $costTotal, array $settlement): void
    {
        $net = $grandTotal->minus($taxTotal);

        $lines = [
            ['account' => PostingService::SALES_RETURNS, 'debit' => $net, 'memo' => 'مرتجع مبيعات'],
        ];

        if ($taxTotal->isPositive()) {
            $lines[] = ['account' => PostingService::TAX_PAYABLE, 'debit' => $taxTotal, 'memo' => 'عكس ضريبة'];
        }
        if ($settlement['cash']->isPositive()) {
            $lines[] = ['account' => PostingService::CASH, 'credit' => $settlement['cash'], 'memo' => 'رد نقدي'];
        }
        if ($settlement['other']->isPositive()) {
            $lines[] = ['account' => PostingService::CARD_CLEARING, 'credit' => $settlement['other'], 'memo' => 'رد غير نقدي'];
        }
        if ($settlement['credit']->isPositive()) {
            $lines[] = ['account' => PostingService::ACCOUNTS_RECEIVABLE, 'credit' => $settlement['credit'], 'memo' => 'تخفيض مديونية'];
        }

        $this->posting->post('return_revenue', $return, $lines, 'مرتجع مبيعات '.$return->number, $return->business_date->toDateString());

        if ($costTotal->isPositive()) {
            $this->posting->post('return_cogs', $return, [
                ['account' => PostingService::INVENTORY, 'debit' => $costTotal, 'memo' => 'إعادة مخزون'],
                ['account' => PostingService::COGS, 'credit' => $costTotal, 'memo' => 'عكس تكلفة'],
            ], 'تكلفة مرتجع '.$return->number, $return->business_date->toDateString());
        }
    }

    private function destinationFor(string $disposition, Warehouse $sellable, ?Warehouse $quarantine): ?Warehouse
    {
        return match ($disposition) {
            'resalable' => $sellable,
            'damaged', 'inspection', 'returns_warehouse' => $quarantine ?? $sellable,
            default => throw new InvalidOperationException('مصير المرتجع غير معروف.', 'unknown_disposition', 422),
        };
    }

    private function quarantineWarehouse(int $branchId): ?Warehouse
    {
        return Warehouse::query()
            ->where('branch_id', $branchId)
            ->whereIn('type', ['returns', 'damaged'])
            ->where('is_active', true)
            ->orderByRaw("CASE WHEN type = 'returns' THEN 0 ELSE 1 END")
            ->first();
    }

    /** @return array<string,mixed> */
    public function present(SaleReturn $return): array
    {
        $return->loadMissing('lines');

        return [
            'id' => $return->id,
            'uuid' => $return->uuid,
            'number' => $return->number,
            'sale_id' => $return->sale_id,
            'grand_total' => $return->grand_total,
            'refund_cash' => $return->refund_cash,
            'refund_other' => $return->refund_other,
            'credit_applied' => $return->credit_applied,
            'returned_at' => $return->returned_at?->toIso8601String(),
            'lines' => $return->lines->map(fn (SaleReturnLine $l) => [
                'id' => $l->id,
                'sale_line_id' => $l->sale_line_id,
                'product_name' => $l->product_name,
                'qty' => $l->qty,
                'unit_price' => $l->unit_price,
                'total_amount' => $l->total_amount,
                'disposition' => $l->disposition,
            ])->all(),
        ];
    }
}
