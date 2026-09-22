<?php

declare(strict_types=1);

namespace App\Modules\Sales\Services;

use App\Modules\Access\Services\ApprovalService;
use App\Modules\Access\Services\AuditService;
use App\Modules\Access\Services\PermissionService;
use App\Modules\Accounting\Services\PostingService;
use App\Modules\Cash\Models\PaymentMethod;
use App\Modules\Cash\Services\CashService;
use App\Modules\Catalog\Models\ProductUnit;
use App\Modules\Catalog\Models\ProductVariant;
use App\Modules\Catalog\Services\PricingService;
use App\Modules\Catalog\Services\SerialService;
use App\Modules\Core\Models\Warehouse;
use App\Modules\Core\Services\BusinessCalendar;
use App\Modules\Core\Services\PosContext;
use App\Modules\Core\Services\SequenceService;
use App\Modules\Core\Services\SettingsService;
use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Services\CustomerLedgerService;
use App\Modules\Inventory\Services\InventoryService;
use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Models\HeldCart;
use App\Modules\Sales\Models\Quote;
use App\Modules\Sales\Models\Sale;
use App\Modules\Sales\Models\SaleLine;
use App\Modules\Sales\Models\SaleLineSerial;
use App\Modules\Sales\Models\SalePayment;
use App\Modules\Sync\Services\IdempotencyService;
use App\Modules\Sync\Services\OutboxService;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Checkout.
 *
 * ONE database transaction covers: the invoice, its lines, its payments, the
 * stock movements, the drawer movements, the customer ledger and the accounting
 * entries. If any part fails, none of it happened — there is never an invoice
 * without stock, or a cash movement without a document.
 *
 * Everything that matters is decided HERE, on the server: prices, discounts,
 * permissions, stock. The totals sent by the client are only a cross-check.
 *
 * Side effects (printing, integrations) are queued to the outbox and run after
 * the commit, so a dead printer can never void or repeat a completed sale.
 */
class SaleService
{
    public function __construct(
        private readonly SaleTotalsCalculator $calculator,
        private readonly PricingService $pricing,
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
     * @return array{sale: Sale|null, response: array<string,mixed>, replayed: bool}
     */
    public function checkout(SaleRequest $request): array
    {
        $result = $this->idempotency->execute(
            'sale',
            $request->idempotencyKey,
            $request->idempotencyPayload(),
            function () use ($request): array {
                $sale = DB::transaction(fn () => $this->performCheckout($request), 3);

                return ['model' => $sale, 'response' => $this->present($sale)];
            },
        );

        $saleId = $result['response']['id'] ?? null;

        return [
            'sale' => $saleId ? Sale::query()->with(['lines', 'payments'])->find($saleId) : null,
            'response' => $result['response'],
            'replayed' => $result['replayed'],
        ];
    }

    private function performCheckout(SaleRequest $request): Sale
    {
        $user = $this->context->user();
        if (! $user) {
            throw new InvalidOperationException('يجب تسجيل الدخول لإتمام البيع.', 'unauthenticated', 401);
        }

        $terminal = $this->context->terminal();
        if (! $terminal) {
            throw new InvalidOperationException('لم يتم تحديد جهاز الكاشير.', 'terminal_required');
        }

        $shift = $this->context->shift();
        if (! $shift || $shift->status !== 'open') {
            throw new InvalidOperationException('لا توجد وردية مفتوحة على هذا الكاشير.', 'shift_required', 409);
        }

        $warehouse = $this->resolveWarehouse($request, (int) $terminal->branch_id);
        $priceList = $this->pricing->listFor($request->priceListId ?? $this->customerPriceList($request->customerId));
        $taxesEnabled = $this->settings->feature('taxes', (int) $terminal->branch_id);

        // ---- 1. resolve every line on the server -----------------------------
        $resolved = [];
        foreach ($request->lines as $index => $input) {
            $resolved[] = $this->resolveLine($index, $input, $priceList, $taxesEnabled, $user);
        }

        if ($resolved === []) {
            throw new InvalidOperationException('لا توجد بنود في الفاتورة.', 'empty_cart');
        }

        // ---- 2. totals, from the server's own numbers ------------------------
        $totals = $this->calculator->calculate(
            array_map(static fn (array $l): array => [
                'qty' => $l['qty'],
                'unit_price' => $l['unit_price'],
                'discount_amount' => $l['discount_amount'],
                'discount_percent' => $l['discount_percent'],
                'tax_rate' => $l['tax_rate'],
                'tax_inclusive' => $l['tax_inclusive'],
            ], $resolved),
            ['type' => $request->invoiceDiscountType, 'value' => $request->invoiceDiscountValue],
        );

        // The client's total is a cross-check only; a mismatch is refused rather
        // than silently overwritten, so the cashier is never surprised.
        if ($request->expectedGrandTotal !== null
            && ! $totals->grandTotal->equals(Money::of($request->expectedGrandTotal))) {
            throw new InvalidOperationException(
                'الإجمالي المحسوب على الخادم يختلف عن إجمالي الشاشة. أعد مراجعة الفاتورة.',
                'total_mismatch',
                422,
                ['server_total' => $totals->grandTotal->toString(), 'client_total' => $request->expectedGrandTotal],
            );
        }

        // ---- 3. discount authority -------------------------------------------
        $this->authorizeDiscount($user, $totals->discountTotal, $totals->subtotal, $request->approvalUuid);

        // ---- 4. payments ------------------------------------------------------
        $payments = $this->resolvePayments($request, $totals->grandTotal);

        $customer = $request->customerId ? Customer::query()->findOrFail($request->customerId) : null;

        if ($payments['due']->isPositive()) {
            if (! $customer) {
                throw new InvalidOperationException(
                    'البيع الآجل يتطلب اختيار عميل معروف.',
                    'credit_requires_customer',
                    422,
                );
            }
            $this->permissions->authorize($user, 'sales.credit', $this->context->branchId());
            $this->ledger->assertCreditAllowed($customer, $payments['due']);
        }

        // ---- 5. the invoice ---------------------------------------------------
        $sale = Sale::query()->create([
            'uuid' => (string) Str::uuid7(),
            'number' => $this->sequences->next('sale', $terminal->code),
            'branch_id' => $terminal->branch_id,
            'warehouse_id' => $warehouse->id,
            'terminal_id' => $terminal->id,
            'shift_id' => $shift->id,
            'user_id' => $user->id,
            'customer_id' => $customer?->id,
            'price_list_id' => $priceList->id,
            'status' => Sale::STATUS_COMPLETED,
            'sold_at' => now(),
            'business_date' => $this->calendar->businessDate(),
            'subtotal' => $totals->subtotal->toString(4),
            'line_discount_total' => $totals->lineDiscountTotal->toString(4),
            'invoice_discount_total' => $totals->invoiceDiscountTotal->toString(4),
            'discount_total' => $totals->discountTotal->toString(4),
            'taxable_amount' => $totals->taxableAmount->toString(4),
            'tax_total' => $totals->taxTotal->toString(4),
            'rounding_adjustment' => $totals->roundingAdjustment->toString(4),
            'grand_total' => $totals->grandTotal->toString(4),
            'paid_total' => $payments['applied']->toString(4),
            'change_total' => $payments['change']->toString(4),
            'due_total' => $payments['due']->toString(4),
            'invoice_discount_type' => $request->invoiceDiscountType,
            'invoice_discount_value' => $request->invoiceDiscountValue ?? '0',
            'is_credit' => $payments['due']->isPositive(),
            'due_date' => $request->dueDate ?? $this->defaultDueDate($customer),
            'tax_inclusive' => $priceList->tax_inclusive,
            'origin' => $request->origin,
            'offline_uid' => $request->offlineUid,
            'client_created_at' => $request->clientCreatedAt,
            'synced_at' => $request->origin === Sale::ORIGIN_OFFLINE ? now() : null,
            'idempotency_key' => $request->idempotencyKey,
            'notes' => $request->notes,
        ]);

        // ---- 6. lines, stock and cost ----------------------------------------
        $costTotal = Money::zero();
        foreach ($totals->lines as $calc) {
            $source = $resolved[$calc->index];
            $costTotal = $costTotal->plus($this->writeLine($sale, $calc, $source, $warehouse));
        }

        // ---- 7. payments and the drawer --------------------------------------
        foreach ($payments['rows'] as $row) {
            $this->writePayment($sale, $shift, $row);
        }

        // ---- 8. receivable ----------------------------------------------------
        if ($payments['due']->isPositive() && $customer) {
            $this->ledger->debit(
                $customer,
                $payments['due'],
                'sale',
                $sale,
                'فاتورة آجلة رقم '.$sale->number,
                $sale->due_date,
            );
        }

        $sale->forceFill([
            'cost_total' => $costTotal->toString(4),
            'profit_total' => $totals->taxableAmount->minus($costTotal)->toString(4),
        ])->save();

        // ---- 9. accounting ----------------------------------------------------
        $this->postToLedger($sale, $totals, $payments, $costTotal);

        // ---- 10. linked documents --------------------------------------------
        $this->closeSourceDocuments($request, $sale);

        $this->audit->log('sale.completed', $sale, null, [
            'number' => $sale->number,
            'grand_total' => $sale->grand_total,
            'discount_total' => $sale->discount_total,
            'lines' => count($totals->lines),
            'origin' => $sale->origin,
        ]);

        // Queued inside the transaction, executed after it commits.
        $this->outbox->publish('sale.completed', [
            'sale_id' => $sale->id,
            'number' => $sale->number,
            'terminal_id' => $terminal->id,
            'print' => true,
        ]);

        return $sale->refresh();
    }

    /**
     * Resolve one requested line into authoritative values.
     *
     * @param  array<string,mixed>  $input
     * @return array<string,mixed>
     */
    private function resolveLine(int $index, array $input, $priceList, bool $taxesEnabled, $user): array
    {
        $variant = ProductVariant::query()
            ->with(['product.units.unit', 'product.taxGroup'])
            ->find($input['variant_id']);

        if (! $variant || ! $variant->is_active) {
            throw new InvalidOperationException('الصنف غير موجود أو غير مفعل.', 'variant_not_found', 422, ['line' => $index]);
        }

        $product = $variant->product;

        $productUnit = $input['product_unit_id']
            ? $product->units->firstWhere('id', $input['product_unit_id'])
            : $product->defaultSaleUnit();

        if (! $productUnit) {
            throw new InvalidOperationException('وحدة البيع غير معرفة لهذا الصنف.', 'product_unit_not_found', 422, ['line' => $index]);
        }

        $qty = Quantity::of($input['qty']);
        if (! $qty->isPositive()) {
            throw new InvalidOperationException('الكمية يجب أن تكون أكبر من صفر.', 'invalid_line_qty', 422, ['line' => $index]);
        }
        if (! $product->acceptsQuantity($qty)) {
            throw new InvalidOperationException(
                'هذا الصنف يُباع بالقطعة الكاملة ولا يقبل كسورًا.',
                'fractional_qty_not_allowed',
                422,
                ['line' => $index, 'product_id' => $product->id],
            );
        }

        // Server-side price. A different price from the client is only honoured
        // with the price-override permission, and is flagged on the line.
        $resolvedPrice = $this->pricing->priceFor($variant, $productUnit, $priceList, $qty);
        $overridden = false;

        if ($input['unit_price'] !== null && ! Money::of($input['unit_price'])->equals($resolvedPrice)) {
            $this->permissions->authorize($user, 'sales.change_price', $this->context->branchId());
            if (! $product->price_change_allowed) {
                throw new InvalidOperationException('لا يُسمح بتغيير سعر هذا الصنف.', 'price_change_blocked', 422, ['line' => $index]);
            }
            $resolvedPrice = Money::of($input['unit_price']);
            $overridden = true;
        }

        $taxRate = '0';
        $taxInclusive = false;
        if ($taxesEnabled && $product->taxGroup && $product->taxGroup->is_active) {
            $taxRate = (string) $product->taxGroup->rate;
            $taxInclusive = (bool) $product->taxGroup->is_inclusive;
        }

        $serials = $input['serials'] ?? [];
        if ($product->tracksSerials()) {
            if (count($serials) !== (int) $qty->toBigDecimal()->toInt()) {
                throw new InvalidOperationException(
                    'يجب إدخال رقم تسلسلي لكل وحدة مباعة.',
                    'serial_count_mismatch',
                    422,
                    ['line' => $index, 'expected' => $qty->toString(), 'provided' => count($serials)],
                );
            }
        } elseif ($serials !== []) {
            throw new InvalidOperationException('هذا الصنف غير متتبع بالسيريال.', 'serials_not_supported', 422, ['line' => $index]);
        }

        return [
            'index' => $index,
            'variant' => $variant,
            'product' => $product,
            'product_unit' => $productUnit,
            'qty' => $qty,
            'qty_base' => $this->inventory->toBase($qty, (string) $productUnit->factor),
            'unit_price' => $resolvedPrice,
            'discount_amount' => $input['discount_amount'],
            'discount_percent' => $input['discount_percent'],
            'tax_rate' => $taxRate,
            'tax_inclusive' => $taxInclusive,
            'batch_id' => $input['batch_id'],
            'serials' => $serials,
            'price_overridden' => $overridden,
        ];
    }

    /**
     * Persist a line, move the stock and return the line's cost of goods.
     *
     * @param  array<string,mixed>  $source
     */
    private function writeLine(Sale $sale, $calc, array $source, Warehouse $warehouse): Money
    {
        /** @var ProductVariant $variant */
        $variant = $source['variant'];
        $product = $source['product'];
        /** @var ProductUnit $productUnit */
        $productUnit = $source['product_unit'];
        $qtyBase = $source['qty_base'];

        $line = SaleLine::query()->create([
            'sale_id' => $sale->id,
            'line_no' => $calc->index + 1,
            'product_id' => $product->id,
            'variant_id' => $variant->id,
            'product_unit_id' => $productUnit->id,
            'batch_id' => $source['batch_id'],
            // Snapshots: editing the product tomorrow must not change this invoice.
            'product_name' => $product->name,
            'variant_name' => $variant->name,
            'sku' => $variant->sku,
            'unit_name' => $productUnit->unit->name,
            'unit_factor' => (string) $productUnit->factor,
            'tax_group_code' => $product->taxGroup?->code,
            'qty' => $calc->qty->toString(),
            'qty_base' => $qtyBase->toString(),
            'unit_price' => $calc->unitPrice->toString(4),
            'gross_amount' => $calc->gross->toString(4),
            'line_discount_amount' => $calc->lineDiscount->toString(4),
            'line_discount_percent' => $source['discount_percent'] ?? '0',
            'invoice_discount_share' => $calc->invoiceDiscountShare->toString(4),
            'net_amount' => $calc->net->toString(4),
            'tax_rate' => $calc->taxRate,
            'tax_amount' => $calc->tax->toString(4),
            'tax_inclusive' => $calc->taxInclusive,
            'total_amount' => $calc->total->toString(4),
            'price_overridden' => $source['price_overridden'],
        ]);

        if (! $product->isStocked()) {
            return Money::zero(); // services carry no inventory cost
        }

        // Bundles consume their real components, not a phantom item.
        if ($product->type === $product::TYPE_BUNDLE) {
            return $this->consumeBundle($sale, $line, $variant, $qtyBase, $warehouse);
        }

        $movement = $this->inventory->record(
            warehouseId: $warehouse->id,
            variant: $variant,
            qtyBase: $qtyBase->negated(),
            reason: InventoryService::REASON_SALE,
            sourceType: Sale::class,
            sourceId: $sale->id,
            sourceLineId: $line->id,
            productUnitId: $productUnit->id,
            enteredQty: $calc->qty->negated(),
            batchId: $source['batch_id'],
        );

        $unitCost = Money::of($movement->unit_cost);
        $costAmount = $unitCost->multipliedBy($qtyBase)->quantize();

        $line->forceFill([
            'unit_cost' => $unitCost->toString(6),
            'cost_amount' => $costAmount->toString(4),
        ])->save();

        // Serial-tracked units: bind each physical serial to this line.
        foreach ($source['serials'] as $serialValue) {
            $serials = $this->serials->reserveForSale($variant->id, $warehouse->id, [$serialValue]);
            foreach ($serials as $serial) {
                SaleLineSerial::query()->create([
                    'sale_line_id' => $line->id,
                    'serial_id' => $serial->id,
                    'serial' => $serial->serial,
                ]);
                $this->serials->markSold($serial, $line->id, $product->warranty_months);
            }
        }

        return $costAmount;
    }

    private function consumeBundle(Sale $sale, SaleLine $parent, ProductVariant $bundle, Quantity $qtyBase, Warehouse $warehouse): Money
    {
        $cost = Money::zero();

        $components = $bundle->components()->with(['componentVariant.product', 'productUnit'])->get();

        if ($components->isEmpty()) {
            throw new InvalidOperationException('عرض الباقة لا يحتوي على مكونات.', 'bundle_without_components', 422);
        }

        foreach ($components as $component) {
            $componentQtyBase = Quantity::of($component->qty)
                ->multipliedBy((string) $component->productUnit->factor)
                ->multipliedBy($qtyBase);

            $movement = $this->inventory->record(
                warehouseId: $warehouse->id,
                variant: $component->componentVariant,
                qtyBase: $componentQtyBase->negated(),
                reason: InventoryService::REASON_SALE,
                sourceType: Sale::class,
                sourceId: $sale->id,
                sourceLineId: $parent->id,
                productUnitId: $component->product_unit_id,
                enteredQty: $componentQtyBase->negated(),
                note: 'مكوّن باقة',
            );

            $cost = $cost->plus(Money::of($movement->unit_cost)->multipliedBy($componentQtyBase));
        }

        $cost = $cost->quantize();

        $parent->forceFill([
            'cost_amount' => $cost->toString(4),
            'unit_cost' => $cost->dividedBy($qtyBase)->toString(6),
        ])->save();

        return $cost;
    }

    /**
     * Validate tendered money against the invoice.
     *
     * @return array{rows: list<array<string,mixed>>, applied: Money, change: Money, due: Money, cash_net: Money}
     */
    private function resolvePayments(SaleRequest $request, Money $grandTotal): array
    {
        $rows = [];
        $applied = Money::zero();
        $change = Money::zero();
        $cashNet = Money::zero();

        foreach ($request->payments as $i => $payment) {
            $method = PaymentMethod::query()->where('is_active', true)->find($payment['payment_method_id']);
            if (! $method) {
                throw new InvalidOperationException('طريقة الدفع غير معروفة.', 'payment_method_unknown', 422, ['index' => $i]);
            }

            $amount = Money::of($payment['amount'])->quantize();
            if (! $amount->isPositive()) {
                throw new InvalidOperationException('قيمة الدفعة يجب أن تكون أكبر من صفر.', 'invalid_payment_amount', 422, ['index' => $i]);
            }

            if ($method->requires_reference && empty($payment['reference'])) {
                throw new InvalidOperationException(
                    'طريقة الدفع تتطلب رقم مرجع.',
                    'payment_reference_required',
                    422,
                    ['method' => $method->code],
                );
            }

            $tendered = $payment['tendered_amount'] !== null
                ? Money::of($payment['tendered_amount'])->quantize()
                : ($method->allows_change ? $amount : Money::zero());

            $lineChange = Money::zero();
            if ($method->allows_change && $tendered->isGreaterThan($amount)) {
                $lineChange = $tendered->minus($amount);
            } elseif ($tendered->isLessThan($amount) && ! $tendered->isZero()) {
                throw new InvalidOperationException(
                    'المبلغ المستلم أقل من المبلغ المحتسب على هذه الدفعة.',
                    'tender_below_amount',
                    422,
                    ['index' => $i],
                );
            }

            // Only cash-like methods move the physical drawer. A card payment on
            // a 1000 invoice never increases the till.
            if ($method->affects_drawer) {
                $cashNet = $cashNet->plus($amount);
            }

            $rows[] = [
                'method' => $method,
                'amount' => $amount,
                'tendered' => $tendered,
                'change' => $lineChange,
                'reference' => $payment['reference'] ?? null,
            ];

            $applied = $applied->plus($amount);
            $change = $change->plus($lineChange);
        }

        if ($applied->isGreaterThan($grandTotal)) {
            throw new InvalidOperationException(
                'إجمالي المدفوع يتجاوز قيمة الفاتورة.',
                'overpayment',
                422,
                ['paid' => $applied->toString(), 'total' => $grandTotal->toString()],
            );
        }

        $due = $grandTotal->minus($applied);

        if ($due->isPositive() && ! $request->isCredit) {
            throw new InvalidOperationException(
                'المبلغ المدفوع لا يغطي قيمة الفاتورة.',
                'underpayment',
                422,
                ['paid' => $applied->toString(), 'total' => $grandTotal->toString(), 'missing' => $due->toString()],
            );
        }

        return ['rows' => $rows, 'applied' => $applied, 'change' => $change, 'due' => $due, 'cash_net' => $cashNet];
    }

    /** @param array<string,mixed> $row */
    private function writePayment(Sale $sale, $shift, array $row): void
    {
        /** @var PaymentMethod $method */
        $method = $row['method'];

        SalePayment::query()->create([
            'sale_id' => $sale->id,
            'payment_method_id' => $method->id,
            'method_code' => $method->code,
            'method_type' => $method->type,
            'amount' => $row['amount']->toString(4),
            'tendered_amount' => $row['tendered']->toString(4),
            'change_amount' => $row['change']->toString(4),
            'reference' => $row['reference'],
            // Keyed in from an external card terminal; NOT an automatic bank
            // integration. A real provider capture would set this to 'provider'.
            'capture_mode' => 'manual',
            'shift_id' => $shift->id,
        ]);

        if (! $method->affects_drawer) {
            return;
        }

        $account = $this->cash->drawerForTerminal((int) $sale->terminal_id, (int) $sale->branch_id);

        // Gross in, change out: the drawer shows what actually happened.
        $tendered = $row['tendered']->isZero() ? $row['amount'] : $row['tendered'];
        $this->cash->record($account, $shift, CashService::TYPE_SALE_CASH, $tendered, $sale, 'مبيعات نقدية '.$sale->number);

        if ($row['change']->isPositive()) {
            $this->cash->record($account, $shift, CashService::TYPE_CHANGE_OUT, $row['change']->negated(), $sale, 'باقي العميل '.$sale->number);
        }
    }

    private function authorizeDiscount($user, Money $discountTotal, Money $subtotal, ?string $approvalUuid): void
    {
        if ($discountTotal->isZero()) {
            return;
        }

        $this->permissions->authorize($user, 'sales.discount', $this->context->branchId());

        $limits = $user->limits;
        $maxAmount = Money::of($limits->max_discount_amount ?? '0');
        $maxPercent = (string) ($limits->max_discount_percent ?? '0');

        // The effective ceiling is the more generous of the two configured caps.
        $percentCeiling = $subtotal->percentage($maxPercent);
        $ceiling = $percentCeiling->isGreaterThan($maxAmount) ? $percentCeiling : $maxAmount;

        $this->approvals->requireApprovalIfOverLimit(
            $user,
            'sales.discount',
            $discountTotal,
            $ceiling->quantize(),
            $approvalUuid,
        );
    }

    /** @param array<string,mixed> $payments */
    private function postToLedger(Sale $sale, $totals, array $payments, Money $costTotal): void
    {
        $lines = [];

        foreach ($payments['rows'] as $row) {
            /** @var PaymentMethod $method */
            $method = $row['method'];
            $lines[] = [
                'account' => $method->affects_drawer ? PostingService::CASH : PostingService::CARD_CLEARING,
                'debit' => $row['amount'],
                'memo' => $method->name,
            ];
        }

        if ($payments['due']->isPositive()) {
            $lines[] = ['account' => PostingService::ACCOUNTS_RECEIVABLE, 'debit' => $payments['due'], 'memo' => 'بيع آجل'];
        }

        if ($totals->discountTotal->isPositive()) {
            $lines[] = ['account' => PostingService::SALES_DISCOUNT, 'debit' => $totals->discountTotal, 'memo' => 'خصومات المبيعات'];
        }

        // Revenue is the net of discounts; the tax collected is a liability,
        // never revenue.
        $lines[] = ['account' => PostingService::SALES_REVENUE, 'credit' => $totals->taxableAmount->plus($totals->discountTotal), 'memo' => 'إيراد مبيعات'];

        if ($totals->taxTotal->isPositive()) {
            $lines[] = ['account' => PostingService::TAX_PAYABLE, 'credit' => $totals->taxTotal, 'memo' => 'ضريبة محصلة'];
        }

        if (! $totals->roundingAdjustment->isZero()) {
            $adj = $totals->roundingAdjustment;
            $lines[] = $adj->isPositive()
                ? ['account' => PostingService::ROUNDING, 'credit' => $adj, 'memo' => 'تقريب']
                : ['account' => PostingService::ROUNDING, 'debit' => $adj->abs(), 'memo' => 'تقريب'];
        }

        $this->posting->post('sale_revenue', $sale, $lines, 'فاتورة مبيعات '.$sale->number, $sale->business_date->toDateString());

        // Cost of goods sold, posted separately so gross profit is derivable.
        if ($costTotal->isPositive()) {
            $this->posting->post('sale_cogs', $sale, [
                ['account' => PostingService::COGS, 'debit' => $costTotal, 'memo' => 'تكلفة مبيعات'],
                ['account' => PostingService::INVENTORY, 'credit' => $costTotal, 'memo' => 'صرف مخزون'],
            ], 'تكلفة فاتورة '.$sale->number, $sale->business_date->toDateString());
        }
    }

    private function closeSourceDocuments(SaleRequest $request, Sale $sale): void
    {
        if ($request->heldCartId) {
            HeldCart::query()->whereKey($request->heldCartId)->update([
                'status' => 'converted',
                'sale_id' => $sale->id,
            ]);
        }

        if ($request->quoteId) {
            // The unique index on quotes.sale_id prevents a quote being billed twice.
            Quote::query()->whereKey($request->quoteId)->where('status', 'open')->update([
                'status' => 'converted',
                'sale_id' => $sale->id,
            ]);
        }
    }

    private function resolveWarehouse(SaleRequest $request, int $branchId): Warehouse
    {
        if ($request->warehouseId) {
            $warehouse = Warehouse::query()->where('branch_id', $branchId)->findOrFail($request->warehouseId);
        } else {
            $terminal = $this->context->terminal();
            $warehouse = $terminal?->warehouse_id
                ? Warehouse::query()->find($terminal->warehouse_id)
                : Warehouse::query()->where('branch_id', $branchId)->where('is_default', true)->first();
        }

        if (! $warehouse) {
            throw new InvalidOperationException('لم يتم تحديد مخزن البيع.', 'warehouse_not_found', 422);
        }

        if (! $warehouse->is_sellable) {
            throw new InvalidOperationException('المخزن المحدد غير مخصص للبيع.', 'warehouse_not_sellable', 422);
        }

        return $warehouse;
    }

    private function customerPriceList(?int $customerId): ?int
    {
        if (! $customerId) {
            return null;
        }

        return Customer::query()->whereKey($customerId)->value('price_list_id');
    }

    private function defaultDueDate(?Customer $customer): ?string
    {
        if (! $customer || ! $customer->payment_terms_days) {
            return null;
        }

        return now()->addDays((int) $customer->payment_terms_days)->toDateString();
    }

    /** @return array<string,mixed> */
    public function present(Sale $sale): array
    {
        $sale->loadMissing(['lines', 'payments']);

        return [
            'id' => $sale->id,
            'uuid' => $sale->uuid,
            'number' => $sale->number,
            'status' => $sale->status,
            'sold_at' => $sale->sold_at?->toIso8601String(),
            'business_date' => $sale->business_date?->toDateString(),
            'subtotal' => $sale->subtotal,
            'discount_total' => $sale->discount_total,
            'tax_total' => $sale->tax_total,
            'rounding_adjustment' => $sale->rounding_adjustment,
            'grand_total' => $sale->grand_total,
            'paid_total' => $sale->paid_total,
            'change_total' => $sale->change_total,
            'due_total' => $sale->due_total,
            'is_credit' => $sale->is_credit,
            'origin' => $sale->origin,
            'provisional' => $sale->isProvisional(),
            'customer_id' => $sale->customer_id,
            'lines' => $sale->lines->map(fn (SaleLine $l) => [
                'id' => $l->id,
                'line_no' => $l->line_no,
                'product_name' => $l->product_name,
                'variant_name' => $l->variant_name,
                'unit_name' => $l->unit_name,
                'qty' => $l->qty,
                'unit_price' => $l->unit_price,
                'line_discount_amount' => $l->line_discount_amount,
                'invoice_discount_share' => $l->invoice_discount_share,
                'tax_amount' => $l->tax_amount,
                'total_amount' => $l->total_amount,
            ])->all(),
            'payments' => $sale->payments->map(fn (SalePayment $p) => [
                'method_code' => $p->method_code,
                'method_type' => $p->method_type,
                'amount' => $p->amount,
                'tendered_amount' => $p->tendered_amount,
                'change_amount' => $p->change_amount,
                'capture_mode' => $p->capture_mode,
            ])->all(),
        ];
    }
}
