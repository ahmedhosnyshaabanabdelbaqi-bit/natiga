<?php

namespace App\Domain\Sales;

use App\Domain\Credit\CreditService;
use App\Domain\Inventory\ReservationService;
use App\Domain\Shared\AuditLogger;
use App\Domain\Shared\DocumentNumberService;
use App\Domain\Shared\DomainException;
use App\Models\Customer;
use App\Models\ItemUom;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * أمر البيع.
 *
 * الأمر لا يحرّك مخزونًا ولا ينشئ قيدًا — لكنه يحجز البضاعة عند الاعتماد
 * ويدخل في التعرض الائتماني للعميل (الجزء غير المفوتر منه، انظر CreditService).
 *
 * دورة الحياة:
 *   draft ← create()
 *   approved ← approve()   : فحص ائتماني + حجز الكميات
 *   closed ← close()       : سُلّم وفُوتر بالكامل (يُستدعى تلقائيًا)
 *   cancelled ← cancel()   : فك كل الحجوزات
 *
 * الحالات الثلاث مستقلة: delivery_status و invoice_status و payment_status
 * لا تُشتق من بعضها — أمر مسلَّم بالكامل قد يكون غير مفوتر، والعكس.
 */
class SalesOrderService
{
    /** مدة صلاحية الحجز الافتراضية بالأيام — بعدها يحرّره المجدول */
    private const RESERVATION_DAYS = 7;

    public function __construct(
        private readonly CreditService $credit,
        private readonly ReservationService $reservations,
        private readonly DocumentNumberService $numbers,
        private readonly AuditLogger $audit,
    ) {}

    public function create(array $data): SalesOrder
    {
        return DB::transaction(function () use ($data) {
            $companyId = (int) $data['company_id'];

            if (empty($data['lines'])) {
                throw DomainException::make('sales_order.no_lines', 'لا يمكن إنشاء أمر بيع بلا أصناف.');
            }

            $customer = Customer::where('company_id', $companyId)->findOrFail($data['customer_id']);
            $orderDate = $data['order_date'] ?? now()->toDateString();

            $order = SalesOrder::create([
                'company_id' => $companyId,
                'branch_id' => $data['branch_id'] ?? null,
                'order_no' => $data['order_no'] ?? $this->numbers->next($companyId, 'sales_order', $data['branch_id'] ?? null, $orderDate),
                'order_date' => $orderDate,
                'required_date' => $data['required_date'] ?? null,
                'customer_id' => $customer->id,
                'customer_address_id' => $data['customer_address_id'] ?? null,
                'salesman_id' => $data['salesman_id'] ?? $customer->salesman_id,
                'warehouse_id' => $data['warehouse_id'],
                'price_list_id' => $data['price_list_id'] ?? $customer->price_list_id,
                'quotation_id' => $data['quotation_id'] ?? null,
                'cost_center_id' => $data['cost_center_id'] ?? null,
                'customer_po_no' => $data['customer_po_no'] ?? null,
                'channel' => $data['channel'] ?? 'presale',
                'payment_type' => $data['payment_type'] ?? 'credit',
                'payment_term_days' => (int) ($data['payment_term_days'] ?? $customer->payment_term_days),
                'status' => 'draft',
                'is_backorder_allowed' => $data['is_backorder_allowed'] ?? true,
                'notes' => $data['notes'] ?? null,
                'created_by' => $data['user_id'] ?? null,
            ]);

            $this->writeLines($order, $data['lines']);

            $this->audit->log('create', 'sales_order', (int) $order->id, $order->order_no, null, [
                'customer_id' => $order->customer_id,
                'total_amount' => $order->fresh()->total_amount,
            ], companyId: $companyId);

            return $order->fresh('lines');
        });
    }

    /** تعديل أمر ما زال مسودة. الأمر المعتمد لا يُعدَّل — يُلغى ويُعاد إنشاؤه. */
    public function update(SalesOrder $order, array $data): SalesOrder
    {
        return DB::transaction(function () use ($order, $data) {
            $order = SalesOrder::lockForUpdate()->findOrFail($order->id);

            if ($order->status !== 'draft') {
                throw DomainException::make(
                    'sales_order.not_draft',
                    "الأمر {$order->order_no} ليس مسودة (الحالة: {$order->status}) — الأمر المعتمد يُلغى ويُعاد إنشاؤه.",
                );
            }

            $order->update(array_intersect_key($data, array_flip([
                'required_date', 'customer_address_id', 'warehouse_id', 'payment_type',
                'payment_term_days', 'customer_po_no', 'is_backorder_allowed', 'notes',
            ])));

            if (! empty($data['lines'])) {
                SalesOrderLine::where('sales_order_id', $order->id)->delete();
                $this->writeLines($order, $data['lines']);
            }

            return $order->fresh('lines');
        });
    }

    /**
     * الاعتماد: فحص ائتماني ثم حجز الكميات المتاحة.
     *
     * الحجز يقلّل المتاح للبيع فورًا حتى لا يبيع مندوب آخر نفس البضاعة،
     * لكنه لا يحرّك رصيدًا ولا ينشئ قيدًا.
     */
    public function approve(SalesOrder $order, ?int $userId = null, bool $creditOverride = false, ?string $overrideReason = null): SalesOrder
    {
        return DB::transaction(function () use ($order, $userId, $creditOverride, $overrideReason) {
            $order = SalesOrder::lockForUpdate()->findOrFail($order->id);
            $order->load('lines');

            if ($order->status !== 'draft') {
                throw DomainException::make(
                    'sales_order.not_draft',
                    "الأمر {$order->order_no} ليس في حالة مسودة (الحالة: {$order->status}).",
                );
            }

            if ($order->lines->isEmpty()) {
                throw DomainException::make('sales_order.no_lines', 'لا يمكن اعتماد أمر بلا أصناف.');
            }

            $companyId = (int) $order->company_id;

            $this->credit->assertCanSell(
                companyId: $companyId,
                customerId: (int) $order->customer_id,
                additionalAmount: $order->total_amount,
                isCredit: $order->payment_type !== 'cash',
                hasOverride: $creditOverride,
                overrideReason: $overrideReason,
            );

            $expiresAt = now()->addDays(self::RESERVATION_DAYS)->toDateTimeString();
            $shortages = [];

            foreach ($order->lines as $line) {
                try {
                    $this->reservations->reserve(
                        companyId: $companyId,
                        itemId: (int) $line->item_id,
                        warehouseId: (int) $order->warehouse_id,
                        qtyBase: $line->qty_base,
                        docType: 'sales_order',
                        docId: (int) $order->id,
                        docLineId: (int) $line->id,
                        expiresAt: $expiresAt,
                        userId: $userId,
                    );

                    $line->reserved_qty_base = (string) Dec::qty($line->qty_base);
                    $line->save();
                } catch (DomainException $e) {
                    // الأمر الذي يسمح بالتأجيل يُعتمد بما توفّر، وغيره يُرفض كاملًا
                    if (! $order->is_backorder_allowed) {
                        throw $e;
                    }

                    $shortages[] = [
                        'line_id' => (int) $line->id,
                        'item_id' => (int) $line->item_id,
                        'requested' => (string) Dec::qty($line->qty_base),
                        'context' => $e->context,
                    ];
                }
            }

            $order->status = 'approved';
            $order->credit_override = $creditOverride;
            $order->credit_override_by = $creditOverride ? $userId : null;
            $order->credit_override_reason = $creditOverride ? $overrideReason : null;
            $order->approved_by = $userId;
            $order->approved_at = now();
            $order->save();

            $this->audit->log('approve', 'sales_order', (int) $order->id, $order->order_no, null, [
                'total_amount' => $order->total_amount,
                'credit_override' => $creditOverride,
                'shortages' => $shortages ?: null,
            ], $overrideReason, $companyId);

            $fresh = $order->fresh('lines');
            $fresh->setAttribute('shortages', $shortages);

            return $fresh;
        });
    }

    /** الإلغاء: يفك كل الحجوزات. لا يُلغى أمر سُلّم أو فُوتر ولو جزئيًا. */
    public function cancel(SalesOrder $order, string $reason, ?int $userId = null): SalesOrder
    {
        return DB::transaction(function () use ($order, $reason, $userId) {
            $order = SalesOrder::lockForUpdate()->findOrFail($order->id);
            $order->load('lines');

            if ($order->status === 'cancelled') {
                throw DomainException::make('sales_order.already_cancelled', 'الأمر ملغى بالفعل.');
            }

            foreach ($order->lines as $line) {
                if (Dec::gt($line->delivered_qty_base, 0) || Dec::gt($line->invoiced_qty_base, 0)) {
                    throw DomainException::make(
                        'sales_order.partially_executed',
                        'لا يمكن إلغاء أمر سُلّم أو فُوتر ولو جزئيًا. أغلق الكميات المتبقية بدل الإلغاء.',
                    );
                }
            }

            $this->reservations->release('sales_order', (int) $order->id);
            SalesOrderLine::where('sales_order_id', $order->id)->update(['reserved_qty_base' => '0']);

            $order->status = 'cancelled';
            $order->save();

            $this->audit->log('cancel', 'sales_order', (int) $order->id, $order->order_no, null, null, $reason, (int) $order->company_id);

            return $order->fresh('lines');
        });
    }

    /**
     * إغلاق الأمر وفك ما تبقّى من حجز.
     * يُستدعى تلقائيًا عند اكتمال التسليم والفوترة، أو يدويًا لإنهاء المتبقي.
     */
    public function close(SalesOrder $order, ?int $userId = null, ?string $reason = null): SalesOrder
    {
        return DB::transaction(function () use ($order, $userId, $reason) {
            $order = SalesOrder::lockForUpdate()->findOrFail($order->id);

            if (in_array($order->status, ['cancelled', 'closed'], true)) {
                return $order;
            }

            $this->reservations->release('sales_order', (int) $order->id);

            $order->status = 'closed';
            $order->save();

            $this->audit->log('close', 'sales_order', (int) $order->id, $order->order_no, null, null, $reason, (int) $order->company_id);

            return $order->fresh('lines');
        });
    }

    /**
     * تحديث حالتَي التسليم والفوترة من واقع سطور الأمر، وإغلاقه إن اكتمل الاثنان.
     * يُستدعى من خدمتَي إذن التسليم والفاتورة بعد كل عملية.
     */
    public function refreshStatuses(int $orderId, ?int $userId = null): void
    {
        $order = SalesOrder::find($orderId);

        if (! $order || in_array($order->status, ['cancelled', 'closed'], true)) {
            return;
        }

        $lines = DB::table('sales_order_lines')->where('sales_order_id', $orderId)->get();

        $allDelivered = true;
        $anyDelivered = false;
        $allInvoiced = true;
        $anyInvoiced = false;

        foreach ($lines as $line) {
            if (Dec::gt($line->delivered_qty_base, 0)) {
                $anyDelivered = true;
            }
            if (Dec::lt($line->delivered_qty_base, $line->qty_base)) {
                $allDelivered = false;
            }
            if (Dec::gt($line->invoiced_qty_base, 0)) {
                $anyInvoiced = true;
            }
            if (Dec::lt($line->invoiced_qty_base, $line->qty_base)) {
                $allInvoiced = false;
            }
        }

        $order->delivery_status = $allDelivered ? 'delivered' : ($anyDelivered ? 'partial' : 'pending');
        $order->invoice_status = $allInvoiced ? 'invoiced' : ($anyInvoiced ? 'partial' : 'pending');
        $order->save();

        if ($allDelivered && $allInvoiced) {
            $this->close($order, $userId, 'اكتمل التسليم والفوترة');
        }
    }

    /** كتابة السطور وحساب الإجماليات — نفس قواعد الفاتورة حرفًا بحرف. */
    private function writeLines(SalesOrder $order, array $lines): void
    {
        $subtotal = Dec::of(0);
        $lineDiscount = Dec::of(0);
        $taxTotal = Dec::of(0);
        $lineNo = 1;

        foreach ($lines as $line) {
            $factor = $this->uomFactor((int) $line['item_id'], (int) $line['uom_id']);
            $qtyUom = Dec::round($line['qty_uom'], Dec::SCALE_QTY);
            $qtyBase = Dec::round(Dec::mul($qtyUom, $factor), Dec::SCALE_QTY);

            if (! $qtyBase->isPositive()) {
                throw DomainException::make('sales_order.invalid_qty', 'كمية السطر يجب أن تكون موجبة.');
            }

            $isFree = (bool) ($line['is_free'] ?? false);
            $unitPrice = $isFree ? Dec::of(0) : Dec::round($line['unit_price'], Dec::SCALE_MONEY);
            $gross = Dec::round(Dec::mul($qtyUom, $unitPrice), Dec::SCALE_MONEY);

            $discountPct = Dec::of($line['discount_pct'] ?? 0);
            $discountAmount = isset($line['discount_amount'])
                ? Dec::round($line['discount_amount'], Dec::SCALE_MONEY)
                : Dec::round(Dec::div(Dec::mul($gross, $discountPct), 100), Dec::SCALE_MONEY);

            $net = Dec::sub($gross, $discountAmount);
            $taxRate = Dec::of($line['tax_rate'] ?? 0);
            $tax = Dec::round(Dec::div(Dec::mul($net, $taxRate), 100), Dec::SCALE_MONEY);

            SalesOrderLine::create([
                'sales_order_id' => $order->id,
                'line_no' => $lineNo++,
                'item_id' => $line['item_id'],
                'uom_id' => $line['uom_id'],
                'uom_factor' => (string) $factor,
                'qty_uom' => (string) $qtyUom,
                'qty_base' => (string) $qtyBase,
                'unit_price' => (string) $unitPrice,
                'discount_pct' => (string) $discountPct,
                'discount_amount' => (string) $discountAmount,
                'tax_code_id' => $line['tax_code_id'] ?? null,
                'tax_rate' => (string) $taxRate,
                'tax_amount' => (string) $tax,
                'line_total' => (string) $net,
                'is_free' => $isFree,
                'promotion_id' => $line['promotion_id'] ?? null,
                'notes' => $line['notes'] ?? null,
            ]);

            $subtotal = Dec::add($subtotal, $gross);
            $lineDiscount = Dec::add($lineDiscount, $discountAmount);
            $taxTotal = Dec::add($taxTotal, $tax);
        }

        $headerDiscount = Dec::round($order->header_discount_amount ?? 0, Dec::SCALE_MONEY);
        $total = Dec::add(
            Dec::sub(Dec::sub($subtotal, $lineDiscount), $headerDiscount),
            Dec::add($taxTotal, $order->delivery_fee ?? 0),
        );

        $order->update([
            'subtotal' => (string) Dec::round($subtotal, Dec::SCALE_MONEY),
            'line_discount_amount' => (string) Dec::round($lineDiscount, Dec::SCALE_MONEY),
            'header_discount_amount' => (string) $headerDiscount,
            'tax_amount' => (string) Dec::round($taxTotal, Dec::SCALE_MONEY),
            'total_amount' => (string) Dec::round($total, Dec::SCALE_MONEY),
        ]);
    }

    private function uomFactor(int $itemId, int $uomId): \Brick\Math\BigDecimal
    {
        $factor = ItemUom::where('item_id', $itemId)->where('uom_id', $uomId)->value('factor');

        if ($factor === null) {
            throw DomainException::make('item.uom_not_defined', 'الوحدة المختارة غير معرّفة لهذا الصنف.');
        }

        return Dec::of($factor);
    }
}
