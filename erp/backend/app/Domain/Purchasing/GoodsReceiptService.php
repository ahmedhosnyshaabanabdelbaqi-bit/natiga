<?php

namespace App\Domain\Purchasing;

use App\Domain\Accounting\LedgerPoster;
use App\Domain\Accounting\PostingMatrix;
use App\Domain\Inventory\StockPoster;
use App\Domain\Shared\AuditLogger;
use App\Domain\Shared\DocumentNumberService;
use App\Domain\Shared\DomainException;
use App\Models\GoodsReceipt;
use App\Models\GoodsReceiptLine;
use App\Models\ItemUom;
use App\Models\StockBatch;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * الاستلام المخزني — منفصل تمامًا عن فاتورة المورد.
 *
 * الأثر المخزني يحدث هنا مرة واحدة فقط. فاتورة المورد لاحقًا تثبت الالتزام المالي
 * ولا تضيف المخزون مرة ثانية.
 *
 * القيد: من ح/ المخزون   إلى ح/ بضاعة مستلمة غير مفوترة (GRNI)
 */
class GoodsReceiptService
{
    public function __construct(
        private readonly StockPoster $stock,
        private readonly LedgerPoster $ledger,
        private readonly PostingMatrix $matrix,
        private readonly DocumentNumberService $numbers,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * @param  array{company_id:int, branch_id?:int|null, supplier_id:int, warehouse_id:int,
     *               receipt_date:string, purchase_order_id?:int|null, supplier_delivery_no?:string|null,
     *               notes?:string|null, user_id?:int|null,
     *               lines:array<int, array{item_id:int, uom_id:int, qty_uom:mixed, unit_price:mixed,
     *                                      purchase_order_line_id?:int|null, batch_no?:string|null,
     *                                      expiry_date?:string|null, mfg_date?:string|null,
     *                                      status_bucket?:string}>}  $data
     */
    public function createAndPost(array $data): GoodsReceipt
    {
        return DB::transaction(function () use ($data) {
            $receipt = $this->create($data);

            return $this->post($receipt, $data['user_id'] ?? null);
        });
    }

    public function create(array $data): GoodsReceipt
    {
        $companyId = (int) $data['company_id'];

        if (empty($data['lines'])) {
            throw DomainException::make('receipt.no_lines', 'لا يمكن إنشاء استلام بلا أصناف.');
        }

        $receipt = GoodsReceipt::create([
            'company_id' => $companyId,
            'branch_id' => $data['branch_id'] ?? null,
            'receipt_no' => $data['receipt_no'] ?? $this->numbers->next($companyId, 'goods_receipt', $data['branch_id'] ?? null, $data['receipt_date']),
            'receipt_date' => $data['receipt_date'],
            'supplier_id' => $data['supplier_id'],
            'warehouse_id' => $data['warehouse_id'],
            'purchase_order_id' => $data['purchase_order_id'] ?? null,
            'supplier_delivery_no' => $data['supplier_delivery_no'] ?? null,
            'status' => 'draft',
            'notes' => $data['notes'] ?? null,
            'created_by' => $data['user_id'] ?? null,
        ]);

        $lineNo = 1;
        foreach ($data['lines'] as $line) {
            $factor = $this->uomFactor((int) $line['item_id'], (int) $line['uom_id']);
            $qtyUom = Dec::round($line['qty_uom'], Dec::SCALE_QTY);
            $qtyBase = Dec::round(Dec::mul($qtyUom, $factor), Dec::SCALE_QTY);

            if (! $qtyBase->isPositive()) {
                throw DomainException::make('receipt.invalid_qty', 'كمية الاستلام يجب أن تكون موجبة.');
            }

            // سعر الوحدة المُدخل بوحدة المستند؛ يُحوَّل إلى تكلفة الوحدة الأساسية
            $unitPriceInUom = Dec::round($line['unit_price'], Dec::SCALE_MONEY);
            $unitCostBase = Dec::round(Dec::div($unitPriceInUom, $factor, Dec::SCALE_CALC), Dec::SCALE_COST);
            $lineCost = Dec::round(Dec::mul($qtyUom, $unitPriceInUom), Dec::SCALE_MONEY);

            $batchId = null;
            if (! empty($line['batch_no'])) {
                $batchId = StockBatch::firstOrCreate(
                    [
                        'company_id' => $companyId,
                        'item_id' => $line['item_id'],
                        'batch_no' => $line['batch_no'],
                    ],
                    [
                        'mfg_date' => $line['mfg_date'] ?? null,
                        'expiry_date' => $line['expiry_date'] ?? null,
                        'supplier_id' => $data['supplier_id'],
                        'source_doc_type' => 'goods_receipt',
                        'source_doc_id' => $receipt->id,
                    ],
                )->id;
            }

            GoodsReceiptLine::create([
                'goods_receipt_id' => $receipt->id,
                'line_no' => $lineNo++,
                'purchase_order_line_id' => $line['purchase_order_line_id'] ?? null,
                'item_id' => $line['item_id'],
                'uom_id' => $line['uom_id'],
                'uom_factor' => (string) $factor,
                'batch_id' => $batchId,
                'batch_no' => $line['batch_no'] ?? null,
                'expiry_date' => $line['expiry_date'] ?? null,
                'qty_uom' => (string) $qtyUom,
                'qty_base' => (string) $qtyBase,
                'unit_cost' => (string) $unitCostBase,
                'line_cost' => (string) $lineCost,
                'status_bucket' => $line['status_bucket'] ?? 'available',
            ]);
        }

        $receipt->total_cost = (string) Dec::round($receipt->lines()->sum('line_cost'), Dec::SCALE_MONEY);
        $receipt->save();

        return $receipt->fresh('lines');
    }

    public function post(GoodsReceipt $receipt, ?int $userId = null): GoodsReceipt
    {
        if (! DB::transactionLevel()) {
            return DB::transaction(fn () => $this->post($receipt, $userId));
        }

        $receipt = GoodsReceipt::lockForUpdate()->findOrFail($receipt->id);

        if ($receipt->status !== 'draft') {
            throw DomainException::make('receipt.not_draft', "الاستلام {$receipt->receipt_no} ليس في حالة مسودة (الحالة: {$receipt->status}).");
        }

        $companyId = (int) $receipt->company_id;
        $totalCost = Dec::of(0);

        foreach ($receipt->lines as $line) {
            $this->stock->receive([
                'company_id' => $companyId,
                'item_id' => (int) $line->item_id,
                'warehouse_id' => (int) $receipt->warehouse_id,
                'batch_id' => $line->batch_id,
                'status_bucket' => $line->status_bucket,
                'doc_type' => 'goods_receipt',
                'doc_id' => (int) $receipt->id,
                'doc_line_id' => (int) $line->id,
                'doc_no' => $receipt->receipt_no,
                'qty_base' => $line->qty_base,
                'unit_cost' => $line->unit_cost,
                'uom_id' => (int) $line->uom_id,
                'uom_factor' => $line->uom_factor,
                'qty_in_uom' => $line->qty_uom,
                'movement_date' => $receipt->receipt_date->toDateString(),
                'created_by' => $userId,
            ]);

            $totalCost = Dec::add($totalCost, $line->line_cost);

            // تحديث تقدم أمر الشراء
            if ($line->purchase_order_line_id) {
                DB::table('purchase_order_lines')
                    ->where('id', $line->purchase_order_line_id)
                    ->update(['received_qty_base' => DB::raw('received_qty_base + '.$line->qty_base)]);
            }
        }

        $this->ledger->post(
            companyId: $companyId,
            entryDate: $receipt->receipt_date->toDateString(),
            sourceType: 'goods_receipt',
            sourceId: (int) $receipt->id,
            sourceNo: $receipt->receipt_no,
            description: "استلام بضاعة من المورد — {$receipt->receipt_no}",
            lines: [
                [
                    'account_id' => $this->matrix->accountId($companyId, 'goods_receipt', 'inventory'),
                    'debit' => (string) $totalCost,
                    'description' => 'قيمة البضاعة المستلمة',
                ],
                [
                    'account_id' => $this->matrix->accountId($companyId, 'goods_receipt', 'grni'),
                    'credit' => (string) $totalCost,
                    'partner_type' => 'supplier',
                    'partner_id' => (int) $receipt->supplier_id,
                    'description' => 'بضاعة مستلمة غير مفوترة',
                ],
            ],
            branchId: $receipt->branch_id,
            userId: $userId,
        );

        $receipt->status = 'posted';
        $receipt->total_cost = (string) Dec::round($totalCost, Dec::SCALE_MONEY);
        $receipt->posted_by = $userId;
        $receipt->posted_at = now();
        $receipt->save();

        $this->refreshPurchaseOrderStatus($receipt);

        $this->audit->log('post', 'goods_receipt', (int) $receipt->id, $receipt->receipt_no, null, [
            'total_cost' => $receipt->total_cost,
        ], companyId: $companyId);

        return $receipt->fresh('lines');
    }

    private function refreshPurchaseOrderStatus(GoodsReceipt $receipt): void
    {
        if (! $receipt->purchase_order_id) {
            return;
        }

        $lines = DB::table('purchase_order_lines')->where('purchase_order_id', $receipt->purchase_order_id)->get();
        $allReceived = true;
        $anyReceived = false;

        foreach ($lines as $line) {
            if (Dec::gt($line->received_qty_base, 0)) {
                $anyReceived = true;
            }
            if (Dec::lt($line->received_qty_base, $line->qty_base)) {
                $allReceived = false;
            }
        }

        DB::table('purchase_orders')->where('id', $receipt->purchase_order_id)->update([
            'receipt_status' => $allReceived ? 'received' : ($anyReceived ? 'partially_received' : 'not_received'),
            'status' => $allReceived ? 'received' : ($anyReceived ? 'partially_received' : DB::raw('status')),
            'updated_at' => now(),
        ]);
    }

    private function uomFactor(int $itemId, int $uomId): \Brick\Math\BigDecimal
    {
        $factor = ItemUom::where('item_id', $itemId)->where('uom_id', $uomId)->value('factor');

        if ($factor === null) {
            throw DomainException::make(
                'item.uom_not_defined',
                "الوحدة المختارة غير معرّفة لهذا الصنف. عرّف معامل التحويل أولًا.",
                ['item_id' => $itemId, 'uom_id' => $uomId],
            );
        }

        return Dec::of($factor);
    }
}
