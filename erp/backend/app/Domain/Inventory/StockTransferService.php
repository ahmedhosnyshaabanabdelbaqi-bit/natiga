<?php

namespace App\Domain\Inventory;

use App\Domain\Shared\AuditLogger;
use App\Domain\Shared\DocumentNumberService;
use App\Domain\Shared\DomainException;
use App\Models\ItemUom;
use App\Models\StockTransfer;
use App\Models\StockTransferLine;
use App\Models\Warehouse;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * التحويل بين المخازن بإرسال واستلام منفصلين عبر «مخزون بالطريق».
 *
 * - عند الإرسال: يخرج من المخزن المصدر ويدخل مخزن الطريق بحالة in_transit.
 * - عند الاستلام: يخرج من مخزن الطريق ويدخل المخزن الهدف.
 * - الصنف لا يظهر في المخزنين في الوقت نفسه.
 * - التحويل الداخلي ليس بيعًا ولا ينشئ ربحًا ولا يغيّر متوسط التكلفة.
 * - يدعم الاستلام الجزئي والعجز والزيادة والفحص.
 */
class StockTransferService
{
    public function __construct(
        private readonly StockPoster $stock,
        private readonly DocumentNumberService $numbers,
        private readonly AuditLogger $audit,
    ) {}

    public function create(array $data): StockTransfer
    {
        $companyId = (int) $data['company_id'];

        if (empty($data['lines'])) {
            throw DomainException::make('transfer.no_lines', 'لا يمكن إنشاء تحويل بلا أصناف.');
        }

        if ((int) $data['from_warehouse_id'] === (int) $data['to_warehouse_id']) {
            throw DomainException::make('transfer.same_warehouse', 'لا يمكن التحويل من وإلى نفس المخزن.');
        }

        $transfer = StockTransfer::create([
            'company_id' => $companyId,
            'branch_id' => $data['branch_id'] ?? null,
            'transfer_no' => $data['transfer_no'] ?? $this->numbers->next($companyId, 'stock_transfer', $data['branch_id'] ?? null, $data['transfer_date']),
            'transfer_date' => $data['transfer_date'],
            'from_warehouse_id' => $data['from_warehouse_id'],
            'to_warehouse_id' => $data['to_warehouse_id'],
            'purpose' => $data['purpose'] ?? 'inter_warehouse',
            'load_order_id' => $data['load_order_id'] ?? null,
            'driver_user_id' => $data['driver_user_id'] ?? null,
            'status' => 'draft',
            'notes' => $data['notes'] ?? null,
            'created_by' => $data['user_id'] ?? null,
        ]);

        $lineNo = 1;
        foreach ($data['lines'] as $line) {
            $factor = $this->uomFactor((int) $line['item_id'], (int) $line['uom_id']);
            $qtyUom = Dec::round($line['qty_uom'], Dec::SCALE_QTY);
            $qtyBase = Dec::round(Dec::mul($qtyUom, $factor), Dec::SCALE_QTY);

            StockTransferLine::create([
                'stock_transfer_id' => $transfer->id,
                'line_no' => $lineNo++,
                'item_id' => $line['item_id'],
                'uom_id' => $line['uom_id'],
                'uom_factor' => (string) $factor,
                'batch_id' => $line['batch_id'] ?? null,
                'qty_uom' => (string) $qtyUom,
                'qty_base' => (string) $qtyBase,
                'received_status_bucket' => $line['received_status_bucket'] ?? StockLedger::BUCKET_AVAILABLE,
            ]);
        }

        return $transfer->fresh('lines');
    }

    /** الإرسال: من المخزن المصدر إلى «بالطريق». */
    public function send(StockTransfer $transfer, ?int $userId = null): StockTransfer
    {
        if (! DB::transactionLevel()) {
            return DB::transaction(fn () => $this->send($transfer, $userId));
        }

        $transfer = StockTransfer::lockForUpdate()->findOrFail($transfer->id);

        if ($transfer->status !== 'draft') {
            throw DomainException::make('transfer.not_draft', "التحويل {$transfer->transfer_no} ليس في حالة مسودة.");
        }

        $transitWarehouseId = $this->transitWarehouseId((int) $transfer->company_id, $transfer->branch_id);

        foreach ($transfer->lines as $line) {
            $parts = $this->stock->transferAllocated(
                [
                    'company_id' => (int) $transfer->company_id,
                    'item_id' => (int) $line->item_id,
                    'batch_id' => $line->batch_id,
                    'doc_type' => 'stock_transfer_send',
                    'doc_id' => (int) $transfer->id,
                    'doc_line_id' => (int) $line->id,
                    'doc_no' => $transfer->transfer_no,
                    'qty_base' => $line->qty_base,
                    'uom_id' => (int) $line->uom_id,
                    'uom_factor' => $line->uom_factor,
                    'qty_in_uom' => $line->qty_uom,
                    'movement_date' => $transfer->transfer_date->toDateString(),
                    'created_by' => $userId,
                    'status_bucket' => StockLedger::BUCKET_AVAILABLE,
                ],
                fromWarehouseId: (int) $transfer->from_warehouse_id,
                toWarehouseId: $transitWarehouseId,
                toBucket: StockLedger::BUCKET_IN_TRANSIT,
            );

            // إذا غُطّي السطر من دفعة واحدة، تُثبت على السطر ليُستلم بها
            if (empty($line->batch_id) && count($parts) === 1) {
                $line->batch_id = $parts[0]['batch_id'];
                $line->save();
            }
        }

        $transfer->status = 'sent';
        $transfer->sent_by = $userId;
        $transfer->sent_at = now();
        $transfer->save();

        $this->audit->log('send', 'stock_transfer', (int) $transfer->id, $transfer->transfer_no, companyId: (int) $transfer->company_id);

        return $transfer->fresh('lines');
    }

    /**
     * الاستلام: من «بالطريق» إلى المخزن الهدف. يدعم الجزئي والعجز والزيادة.
     *
     * @param  array<int, array{line_id:int, received_qty_uom:mixed, status_bucket?:string}>  $receivedLines
     */
    public function receive(StockTransfer $transfer, array $receivedLines, ?int $userId = null): StockTransfer
    {
        if (! DB::transactionLevel()) {
            return DB::transaction(fn () => $this->receive($transfer, $receivedLines, $userId));
        }

        $transfer = StockTransfer::lockForUpdate()->findOrFail($transfer->id);

        if (! in_array($transfer->status, ['sent', 'partially_received'], true)) {
            throw DomainException::make('transfer.not_sent', "التحويل {$transfer->transfer_no} غير مُرسل بعد (الحالة: {$transfer->status}).");
        }

        $transitWarehouseId = $this->transitWarehouseId((int) $transfer->company_id, $transfer->branch_id);
        $byId = collect($receivedLines)->keyBy('line_id');

        foreach ($transfer->lines as $line) {
            $input = $byId->get($line->id);
            if (! $input) {
                continue;
            }

            $receivedUom = Dec::round($input['received_qty_uom'], Dec::SCALE_QTY);
            $receivedBase = Dec::round(Dec::mul($receivedUom, $line->uom_factor), Dec::SCALE_QTY);

            if (! $receivedBase->isPositive()) {
                continue;
            }

            $alreadyReceived = Dec::of($line->received_qty_base);
            $remaining = Dec::sub($line->qty_base, $alreadyReceived);

            if (Dec::gt($receivedBase, $remaining)) {
                // زيادة عن المُرسل — تُسجَّل صراحةً ولا تُبتلع بصمت
                $excess = Dec::sub($receivedBase, $remaining);
                $line->excess_qty_base = (string) Dec::add($line->excess_qty_base, $excess);
                throw DomainException::make(
                    'transfer.excess_received',
                    "الكمية المستلمة ({$receivedBase}) تتجاوز المتبقي بالطريق ({$remaining}) في سطر #{$line->id}. سجّل زيادة الاستلام بمستند تسوية معتمد.",
                    ['line_id' => $line->id, 'remaining' => (string) $remaining],
                );
            }

            $this->stock->transferAllocated(
                [
                    'company_id' => (int) $transfer->company_id,
                    'item_id' => (int) $line->item_id,
                    'batch_id' => $line->batch_id,
                    'doc_type' => 'stock_transfer_receive',
                    'doc_id' => (int) $transfer->id,
                    'doc_line_id' => (int) $line->id,
                    'doc_no' => $transfer->transfer_no,
                    'qty_base' => (string) $receivedBase,
                    'uom_id' => (int) $line->uom_id,
                    'uom_factor' => $line->uom_factor,
                    'qty_in_uom' => (string) $receivedUom,
                    'movement_date' => now()->toDateString(),
                    'created_by' => $userId,
                    'status_bucket' => StockLedger::BUCKET_IN_TRANSIT,
                ],
                fromWarehouseId: $transitWarehouseId,
                toWarehouseId: (int) $transfer->to_warehouse_id,
                toBucket: $input['status_bucket'] ?? $line->received_status_bucket,
            );

            $line->received_qty_base = (string) Dec::add($alreadyReceived, $receivedBase);
            $line->save();
        }

        $transfer->refresh()->load('lines');
        $allReceived = $transfer->lines->every(fn ($l) => Dec::gte($l->received_qty_base, $l->qty_base));
        $anyReceived = $transfer->lines->contains(fn ($l) => Dec::gt($l->received_qty_base, 0));

        $transfer->status = $allReceived ? 'received' : ($anyReceived ? 'partially_received' : 'sent');
        $transfer->received_by = $userId;
        $transfer->received_at = now();
        $transfer->save();

        $this->audit->log('receive', 'stock_transfer', (int) $transfer->id, $transfer->transfer_no, null, [
            'status' => $transfer->status,
        ], companyId: (int) $transfer->company_id);

        return $transfer->fresh('lines');
    }

    /** تسجيل العجز: ما بقي بالطريق ولم يُستلم يُحوَّل إلى فرق معتمد. */
    public function recordShortage(StockTransfer $transfer, ?int $userId = null): StockTransfer
    {
        $transfer->load('lines');

        foreach ($transfer->lines as $line) {
            $shortage = Dec::sub($line->qty_base, $line->received_qty_base);
            if ($shortage->isPositive()) {
                $line->shortage_qty_base = (string) $shortage;
                $line->save();
            }
        }

        return $transfer->fresh('lines');
    }

    /** مخزن «البضاعة بالطريق» — يُنشأ تلقائيًا لكل شركة عند أول تحويل. */
    public function transitWarehouseId(int $companyId, ?int $branchId = null): int
    {
        $warehouse = Warehouse::firstOrCreate(
            ['company_id' => $companyId, 'type' => 'transit', 'code' => 'TRANSIT'],
            [
                'branch_id' => $branchId,
                'name' => 'بضاعة بالطريق',
                'is_sellable' => false,
                'is_active' => true,
            ],
        );

        return (int) $warehouse->id;
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
