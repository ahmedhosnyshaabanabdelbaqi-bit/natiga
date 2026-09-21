<?php

namespace App\Domain\Sales;

use App\Domain\Accounting\LedgerPoster;
use App\Domain\Accounting\PostingMatrix;
use App\Domain\Inventory\ReservationService;
use App\Domain\Inventory\StockLedger;
use App\Domain\Inventory\StockPoster;
use App\Domain\Shared\AuditLogger;
use App\Domain\Shared\DocumentNumberService;
use App\Domain\Shared\DomainException;
use App\Models\DeliveryNote;
use App\Models\DeliveryNoteLine;
use App\Models\ItemUom;
use App\Models\SalesOrder;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * إذن التسليم — مالك حركة البضاعة في البيع بالتوصيل.
 *
 * لماذا لا تخصم الفاتورة المخزون هنا؟
 * لأن البضاعة تخرج من المخزن يوم التحميل، والفاتورة قد تصدر بعدها بأيام.
 * لو خصم كلاهما لخرجت البضاعة مرتين. فالإذن هو المالك، والفاتورة المرتبطة به
 * تُنشأ بـ is_stock_owner = false وتأخذ التكلفة المحفوظة في سطور الإذن.
 *
 * المسار المحاسبي:
 *   الإرسال : من ح/ بضاعة مسلّمة غير مفوترة  إلى ح/ المخزون
 *   الفاتورة: من ح/ تكلفة المبيعات            إلى ح/ بضاعة مسلّمة غير مفوترة
 * بضاعة خرجت ولم تُفوتر تبقى أصلًا في الميزانية، لا تكلفة ولا مخزونًا.
 *
 * دورة الحياة:
 *   draft              ← create()
 *   out_for_delivery   ← dispatch()  : البضاعة تخرج من المخزن فعليًا
 *   delivered | partially_delivered ← confirm() : المرفوض يعود للمخزن بتكلفته
 *   failed | rescheduled ← fail()    : كل البضاعة تعود للمخزن
 *   cancelled          ← cancel()
 */
class DeliveryNoteService
{
    public function __construct(
        private readonly StockPoster $stock,
        private readonly LedgerPoster $ledger,
        private readonly PostingMatrix $matrix,
        private readonly ReservationService $reservations,
        private readonly SalesOrderService $orders,
        private readonly DocumentNumberService $numbers,
        private readonly AuditLogger $audit,
    ) {}

    public function createAndDispatch(array $data): DeliveryNote
    {
        return DB::transaction(function () use ($data) {
            $note = $this->create($data);

            return $this->dispatch($note, $data['user_id'] ?? null);
        });
    }

    /**
     * إنشاء إذن من أمر بيع (كليًا أو جزئيًا) أو بسطور مباشرة.
     * التسليم الجزئي: مرّر lines بالكميات المطلوب تحميلها فقط.
     */
    public function create(array $data): DeliveryNote
    {
        return DB::transaction(function () use ($data) {
            $companyId = (int) $data['company_id'];
            $order = null;

            if (! empty($data['sales_order_id'])) {
                $order = SalesOrder::where('company_id', $companyId)
                    ->lockForUpdate()
                    ->findOrFail($data['sales_order_id']);

                if ($order->status !== 'approved') {
                    throw DomainException::make(
                        'delivery_note.order_not_approved',
                        "أمر البيع {$order->order_no} ليس معتمدًا (الحالة: {$order->status}) — لا يمكن التحميل عليه.",
                    );
                }
            }

            $lines = $data['lines'] ?? ($order ? $this->remainingOrderLines($order) : []);

            if (empty($lines)) {
                throw DomainException::make('delivery_note.no_lines', 'لا يمكن إنشاء إذن تسليم بلا أصناف، أو لم يتبقَّ في الأمر ما يُسلَّم.');
            }

            $deliveryDate = $data['delivery_date'] ?? now()->toDateString();

            $note = DeliveryNote::create([
                'company_id' => $companyId,
                'branch_id' => $data['branch_id'] ?? $order?->branch_id,
                'delivery_no' => $data['delivery_no'] ?? $this->numbers->next($companyId, 'delivery_note', $data['branch_id'] ?? $order?->branch_id, $deliveryDate),
                'delivery_date' => $deliveryDate,
                'customer_id' => $data['customer_id'] ?? $order?->customer_id,
                'sales_order_id' => $order?->id,
                'warehouse_id' => $data['warehouse_id'] ?? $order?->warehouse_id,
                'salesman_id' => $data['salesman_id'] ?? $order?->salesman_id,
                'vehicle_id' => $data['vehicle_id'] ?? null,
                'driver_user_id' => $data['driver_user_id'] ?? null,
                'status' => 'draft',
                // الإذن هو مالك حركة المخزون ما لم يُقل غير ذلك صراحةً
                'is_stock_owner' => $data['is_stock_owner'] ?? true,
                'notes' => $data['notes'] ?? null,
                'created_by' => $data['user_id'] ?? null,
            ]);

            $lineNo = 1;

            foreach ($lines as $line) {
                $factor = $this->uomFactor((int) $line['item_id'], (int) $line['uom_id']);
                $qtyUom = Dec::round($line['qty_uom'], Dec::SCALE_QTY);
                $qtyBase = Dec::round(Dec::mul($qtyUom, $factor), Dec::SCALE_QTY);

                if (! $qtyBase->isPositive()) {
                    throw DomainException::make('delivery_note.invalid_qty', 'كمية السطر يجب أن تكون موجبة.');
                }

                if (! empty($line['sales_order_line_id'])) {
                    $this->assertWithinOrderLine((int) $line['sales_order_line_id'], $qtyBase);
                }

                DeliveryNoteLine::create([
                    'delivery_note_id' => $note->id,
                    'line_no' => $lineNo++,
                    'sales_order_line_id' => $line['sales_order_line_id'] ?? null,
                    'item_id' => $line['item_id'],
                    'uom_id' => $line['uom_id'],
                    'uom_factor' => (string) $factor,
                    'batch_id' => $line['batch_id'] ?? null,
                    'qty_uom' => (string) $qtyUom,
                    'qty_base' => (string) $qtyBase,
                ]);
            }

            $this->audit->log('create', 'delivery_note', (int) $note->id, $note->delivery_no, null, [
                'sales_order_id' => $note->sales_order_id,
                'customer_id' => $note->customer_id,
            ], companyId: $companyId);

            return $note->fresh('lines');
        });
    }

    /**
     * الإرسال: البضاعة تخرج من المخزن فعليًا وتُقيَّد تكلفتها في سطور الإذن.
     * التكلفة المحفوظة هنا هي التي تستخدمها الفاتورة لاحقًا — شراء بسعر أعلى بعدها لا يغيّرها.
     */
    public function dispatch(DeliveryNote $note, ?int $userId = null): DeliveryNote
    {
        if (! DB::transactionLevel()) {
            return DB::transaction(fn () => $this->dispatch($note, $userId));
        }

        $note = DeliveryNote::lockForUpdate()->findOrFail($note->id);
        $note->load('lines');

        if ($note->status !== 'draft') {
            throw DomainException::make(
                'delivery_note.not_draft',
                "الإذن {$note->delivery_no} ليس في حالة مسودة (الحالة: {$note->status}).",
            );
        }

        $companyId = (int) $note->company_id;
        $totalCost = Dec::of(0);

        foreach ($note->lines as $line) {
            // فك الحجز قبل السحب: الحجز يقلّل المتاح، والسحب يقلّل الرصيد نفسه.
            // لو بقي الحجز قائمًا لخُصمت الكمية مرتين من المتاح.
            if ($line->sales_order_line_id) {
                $this->reservations->consume('sales_order', (int) $note->sales_order_id, (int) $line->sales_order_line_id, $line->qty_base);
            }

            if (! $note->is_stock_owner) {
                continue;
            }

            $result = $this->stock->issueAllocated([
                'company_id' => $companyId,
                'item_id' => (int) $line->item_id,
                'warehouse_id' => (int) $note->warehouse_id,
                'batch_id' => $line->batch_id,
                'status_bucket' => StockLedger::BUCKET_AVAILABLE,
                'doc_type' => 'delivery_note',
                'doc_id' => (int) $note->id,
                'doc_line_id' => (int) $line->id,
                'doc_no' => $note->delivery_no,
                'qty_base' => $line->qty_base,
                'uom_id' => (int) $line->uom_id,
                'uom_factor' => $line->uom_factor,
                'qty_in_uom' => $line->qty_uom,
                'movement_date' => $note->delivery_date->toDateString(),
                'created_by' => $userId,
            ]);

            $line->unit_cost = $result['unit_cost'];

            // ربط السطر بالدفعة عند تغطيته من دفعة واحدة، ليعود المرفوض إليها
            if (empty($line->batch_id) && count($result['allocation']) === 1) {
                $line->batch_id = $result['allocation'][0]['batch_id'];
            }

            $line->save();
            $totalCost = Dec::add($totalCost, $result['total_cost']);
        }

        if ($note->is_stock_owner && ! Dec::isZero($totalCost)) {
            $entry = $this->ledger->post(
                companyId: $companyId,
                entryDate: $note->delivery_date->toDateString(),
                sourceType: 'delivery_note',
                sourceId: (int) $note->id,
                sourceNo: $note->delivery_no,
                description: "إذن تسليم — {$note->delivery_no}",
                lines: [
                    [
                        'account_id' => $this->matrix->accountId($companyId, 'delivery_note', 'delivered_not_invoiced'),
                        'debit' => (string) Dec::round($totalCost, Dec::SCALE_MONEY),
                        'partner_type' => 'customer',
                        'partner_id' => (int) $note->customer_id,
                        'description' => 'بضاعة مسلّمة غير مفوترة',
                    ],
                    [
                        'account_id' => $this->matrix->accountId($companyId, 'delivery_note', 'inventory'),
                        'credit' => (string) Dec::round($totalCost, Dec::SCALE_MONEY),
                        'description' => 'إخراج من المخزون بإذن تسليم',
                    ],
                ],
                branchId: $note->branch_id,
                userId: $userId,
            );

            $note->journal_entry_id = $entry->id;
        }

        $note->status = 'out_for_delivery';
        $note->posted_at = now();
        $note->save();

        $this->audit->log('post', 'delivery_note', (int) $note->id, $note->delivery_no, null, [
            'total_cost' => (string) Dec::round($totalCost, Dec::SCALE_MONEY),
            'journal_entry_id' => $note->journal_entry_id,
        ], companyId: $companyId);

        return $note->fresh('lines');
    }

    /**
     * التأكيد على باب العميل.
     *
     * @param array<int, array{line_id:int, delivered_qty_base?:mixed, rejected_qty_base?:mixed, rejection_reason?:string}> $results
     */
    public function confirm(DeliveryNote $note, array $results, array $proof = [], ?int $userId = null): DeliveryNote
    {
        return DB::transaction(function () use ($note, $results, $proof, $userId) {
            $note = DeliveryNote::lockForUpdate()->findOrFail($note->id);
            $note->load('lines');

            if ($note->status !== 'out_for_delivery') {
                throw DomainException::make(
                    'delivery_note.not_out_for_delivery',
                    "الإذن {$note->delivery_no} ليس في الطريق (الحالة: {$note->status}) — لا يُؤكَّد تسليمه.",
                );
            }

            $byLine = [];
            foreach ($results as $row) {
                $byLine[(int) $row['line_id']] = $row;
            }

            $companyId = (int) $note->company_id;
            $rejectedCost = Dec::of(0);
            $anyDelivered = false;
            $allDelivered = true;

            foreach ($note->lines as $line) {
                $row = $byLine[(int) $line->id] ?? null;

                // سطر لم يُذكر في النتيجة يُعد مسلَّمًا بالكامل
                $delivered = $row && isset($row['delivered_qty_base'])
                    ? Dec::round($row['delivered_qty_base'], Dec::SCALE_QTY)
                    : Dec::round($line->qty_base, Dec::SCALE_QTY);

                $rejected = Dec::sub($line->qty_base, $delivered);

                if ($delivered->isNegative() || $rejected->isNegative()) {
                    throw DomainException::make(
                        'delivery_note.invalid_delivered_qty',
                        "الكمية المسلَّمة في السطر {$line->line_no} خارج حدود الكمية المحمّلة ({$line->qty_base}).",
                    );
                }

                $line->delivered_qty_base = (string) $delivered;
                $line->rejected_qty_base = (string) $rejected;
                $line->rejection_reason = $rejected->isPositive() ? ($row['rejection_reason'] ?? null) : null;
                $line->save();

                if ($delivered->isPositive()) {
                    $anyDelivered = true;
                }
                if ($rejected->isPositive()) {
                    $allDelivered = false;
                    $rejectedCost = Dec::add($rejectedCost, $this->returnRejected($note, $line, $rejected, $userId));
                }

                if ($line->sales_order_line_id && $delivered->isPositive()) {
                    DB::table('sales_order_lines')
                        ->where('id', $line->sales_order_line_id)
                        ->update(['delivered_qty_base' => DB::raw('delivered_qty_base + '.$delivered)]);
                }
            }

            // عكس الجزء المرفوض من قيد الإرسال: يعود من «مسلّمة غير مفوترة» إلى المخزون
            if (! Dec::isZero($rejectedCost) && $note->is_stock_owner) {
                $this->ledger->post(
                    companyId: $companyId,
                    entryDate: now()->toDateString(),
                    sourceType: 'delivery_note_rejection',
                    sourceId: (int) $note->id,
                    sourceNo: $note->delivery_no,
                    description: "ارتداد بضاعة مرفوضة — {$note->delivery_no}",
                    lines: [
                        [
                            'account_id' => $this->matrix->accountId($companyId, 'delivery_note', 'inventory'),
                            'debit' => (string) Dec::round($rejectedCost, Dec::SCALE_MONEY),
                            'description' => 'ارتداد للمخزون',
                        ],
                        [
                            'account_id' => $this->matrix->accountId($companyId, 'delivery_note', 'delivered_not_invoiced'),
                            'credit' => (string) Dec::round($rejectedCost, Dec::SCALE_MONEY),
                            'partner_type' => 'customer',
                            'partner_id' => (int) $note->customer_id,
                            'description' => 'إلغاء بضاعة مسلّمة غير مفوترة',
                        ],
                    ],
                    branchId: $note->branch_id,
                    userId: $userId,
                );
            }

            if (! $anyDelivered) {
                throw DomainException::make(
                    'delivery_note.nothing_delivered',
                    'لم يُسلَّم أي صنف — سجّل المحاولة كفاشلة بدل تأكيدها.',
                );
            }

            $note->status = $allDelivered ? 'delivered' : 'partially_delivered';
            $note->receiver_name = $proof['receiver_name'] ?? null;
            $note->signature_path = $proof['signature_path'] ?? null;
            $note->proof_code = $proof['proof_code'] ?? null;
            $note->delivered_at = now();
            $note->save();

            if ($note->sales_order_id) {
                $this->orders->refreshStatuses((int) $note->sales_order_id, $userId);
            }

            $this->audit->log('confirm', 'delivery_note', (int) $note->id, $note->delivery_no, null, [
                'status' => $note->status,
                'receiver_name' => $note->receiver_name,
                'rejected_cost' => (string) Dec::round($rejectedCost, Dec::SCALE_MONEY),
            ], companyId: $companyId);

            return $note->fresh('lines');
        });
    }

    /** محاولة تسليم فاشلة: كل البضاعة تعود للمخزن ويُعكس قيد الإرسال كاملًا. */
    public function fail(DeliveryNote $note, string $reason, ?string $rescheduledTo = null, ?int $userId = null): DeliveryNote
    {
        return DB::transaction(function () use ($note, $reason, $rescheduledTo, $userId) {
            $note = DeliveryNote::lockForUpdate()->findOrFail($note->id);
            $note->load('lines');

            if ($note->status !== 'out_for_delivery') {
                throw DomainException::make(
                    'delivery_note.not_out_for_delivery',
                    "الإذن {$note->delivery_no} ليس في الطريق (الحالة: {$note->status}).",
                );
            }

            $this->returnEverything($note, $reason, $userId);
            $this->reReserve($note, $userId);

            $note->status = $rescheduledTo ? 'rescheduled' : 'failed';
            $note->failure_reason = $reason;
            $note->rescheduled_to = $rescheduledTo;
            $note->save();

            if ($note->sales_order_id) {
                // الحجز يعود لأن البضاعة عادت والأمر ما زال قائمًا
                $this->orders->refreshStatuses((int) $note->sales_order_id, $userId);
            }

            $this->audit->log('fail', 'delivery_note', (int) $note->id, $note->delivery_no, null, [
                'rescheduled_to' => $rescheduledTo,
            ], $reason, (int) $note->company_id);

            return $note->fresh('lines');
        });
    }

    /** الإلغاء: من مسودة بلا أثر، أو من الطريق بإعادة كل البضاعة. */
    public function cancel(DeliveryNote $note, string $reason, ?int $userId = null): DeliveryNote
    {
        return DB::transaction(function () use ($note, $reason, $userId) {
            $note = DeliveryNote::lockForUpdate()->findOrFail($note->id);
            $note->load('lines');

            if (in_array($note->status, ['delivered', 'partially_delivered'], true)) {
                throw DomainException::make(
                    'delivery_note.already_delivered',
                    'لا يُلغى إذن سُلّم فعلًا. استخدم مرتجع مبيعات.',
                );
            }

            if ($note->status === 'cancelled') {
                throw DomainException::make('delivery_note.already_cancelled', 'الإذن ملغى بالفعل.');
            }

            if ($note->is_invoiced) {
                throw DomainException::make('delivery_note.already_invoiced', 'لا يُلغى إذن صدرت عنه فاتورة.');
            }

            if ($note->status === 'out_for_delivery') {
                $this->returnEverything($note, $reason, $userId);
            }

            $note->status = 'cancelled';
            $note->save();

            $this->audit->log('cancel', 'delivery_note', (int) $note->id, $note->delivery_no, null, null, $reason, (int) $note->company_id);

            return $note->fresh('lines');
        });
    }

    /** إرجاع كمية مرفوضة من سطر إلى المخزن بتكلفتها الأصلية. يُرجع تكلفة المرتجع. */
    private function returnRejected(DeliveryNote $note, DeliveryNoteLine $line, \Brick\Math\BigDecimal $qty, ?int $userId): \Brick\Math\BigDecimal
    {
        if (! $note->is_stock_owner) {
            return Dec::of(0);
        }

        $qtyInUom = Dec::gt($line->uom_factor, 0)
            ? Dec::round(Dec::div($qty, $line->uom_factor), Dec::SCALE_QTY)
            : Dec::of(0);

        $this->stock->returnIn([
            'company_id' => (int) $note->company_id,
            'item_id' => (int) $line->item_id,
            'warehouse_id' => (int) $note->warehouse_id,
            'batch_id' => $line->batch_id,
            'status_bucket' => StockLedger::BUCKET_AVAILABLE,
            'doc_type' => 'delivery_note_rejection',
            'doc_id' => (int) $note->id,
            'doc_line_id' => (int) $line->id,
            'doc_no' => $note->delivery_no,
            'qty_base' => (string) $qty,
            'uom_id' => (int) $line->uom_id,
            'uom_factor' => $line->uom_factor,
            'qty_in_uom' => (string) $qtyInUom,
            'movement_date' => now()->toDateString(),
            'created_by' => $userId,
        ], $line->unit_cost);

        return Dec::round(Dec::mul($qty, $line->unit_cost), Dec::SCALE_MONEY);
    }

    /**
     * إعادة حجز الكميات التي ارتدّت، ما دام أمر البيع قائمًا.
     * بدونها تصبح البضاعة متاحة لغير صاحب الأمر رغم أنها ما زالت مطلوبة له.
     */
    private function reReserve(DeliveryNote $note, ?int $userId): void
    {
        if (! $note->sales_order_id) {
            return;
        }

        $order = SalesOrder::find($note->sales_order_id);

        if (! $order || $order->status !== 'approved') {
            return;
        }

        foreach ($note->lines as $line) {
            if (! $line->sales_order_line_id) {
                continue;
            }

            try {
                $this->reservations->reserve(
                    companyId: (int) $note->company_id,
                    itemId: (int) $line->item_id,
                    warehouseId: (int) $note->warehouse_id,
                    qtyBase: $line->qty_base,
                    docType: 'sales_order',
                    docId: (int) $note->sales_order_id,
                    docLineId: (int) $line->sales_order_line_id,
                    expiresAt: now()->addDays(7)->toDateTimeString(),
                    userId: $userId,
                );
            } catch (DomainException) {
                // تعذّر الحجز لا يمنع ارتداد البضاعة — الأمر يبقى بلا حجز ويظهر نقصه عند التحميل التالي
            }
        }
    }

    /** إعادة كل البضاعة المحمّلة إلى المخزن وعكس قيد الإرسال. */
    private function returnEverything(DeliveryNote $note, string $reason, ?int $userId): void
    {
        if (! $note->is_stock_owner) {
            return;
        }

        foreach ($note->lines as $line) {
            $this->returnRejected($note, $line, Dec::round($line->qty_base, Dec::SCALE_QTY), $userId);
            $line->delivered_qty_base = '0';
            $line->rejected_qty_base = (string) Dec::qty($line->qty_base);
            $line->rejection_reason = $reason;
            $line->save();
        }

        if ($note->journalEntry) {
            $this->ledger->reverse($note->journalEntry, now()->toDateString(), "ارتداد إذن التسليم: {$reason}", $userId);
        }
    }

    /** الكميات المتبقية في أمر البيع بعد ما سُلّم منه. */
    private function remainingOrderLines(SalesOrder $order): array
    {
        $lines = [];

        foreach ($order->lines()->get() as $line) {
            $remaining = Dec::sub($line->qty_base, $line->delivered_qty_base);

            if (! $remaining->isPositive()) {
                continue;
            }

            $qtyUom = Dec::gt($line->uom_factor, 0)
                ? Dec::round(Dec::div($remaining, $line->uom_factor), Dec::SCALE_QTY)
                : Dec::of(0);

            $lines[] = [
                'sales_order_line_id' => (int) $line->id,
                'item_id' => (int) $line->item_id,
                'uom_id' => (int) $line->uom_id,
                'qty_uom' => (string) $qtyUom,
            ];
        }

        return $lines;
    }

    /** لا يُحمَّل من سطر الأمر أكثر مما تبقّى فيه. */
    private function assertWithinOrderLine(int $orderLineId, \Brick\Math\BigDecimal $qtyBase): void
    {
        $line = DB::table('sales_order_lines')->where('id', $orderLineId)->lockForUpdate()->first();

        if (! $line) {
            throw DomainException::make('delivery_note.order_line_missing', 'سطر أمر البيع غير موجود.');
        }

        // الكميات المحمّلة في أذون أخرى ما زالت في الطريق تُحسب ضمن المستهلك
        $inTransit = DB::table('delivery_note_lines as dnl')
            ->join('delivery_notes as dn', 'dn.id', '=', 'dnl.delivery_note_id')
            ->where('dnl.sales_order_line_id', $orderLineId)
            ->where('dn.status', 'out_for_delivery')
            ->sum('dnl.qty_base');

        $consumed = Dec::add($line->delivered_qty_base, $inTransit);
        $remaining = Dec::sub($line->qty_base, $consumed);

        if (Dec::gt($qtyBase, $remaining)) {
            throw DomainException::make(
                'delivery_note.exceeds_order_line',
                sprintf(
                    'الكمية المطلوب تحميلها %s تتجاوز المتبقي في سطر الأمر %s (المطلوب %s، المسلَّم %s، وفي الطريق %s).',
                    Dec::qty($qtyBase),
                    Dec::qty($remaining),
                    Dec::qty($line->qty_base),
                    Dec::qty($line->delivered_qty_base),
                    Dec::qty($inTransit),
                ),
                ['order_line_id' => $orderLineId, 'remaining' => (string) Dec::qty($remaining)],
            );
        }
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
