<?php

namespace App\Domain\Inventory;

use App\Domain\Shared\DomainException;
use App\Models\Item;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * دفتر حركة المخزون. كل تغيير في الرصيد يمر من هنا بمستند وحركة قابلة للتتبع.
 * لا يوجد أي مسار لتعديل الرصيد مباشرة من بطاقة الصنف.
 *
 * منع المخزون السالب والبيع المتزامن لنفس الرصيد يتم بقفل صف الرصيد داخل قاعدة البيانات
 * (SELECT ... FOR UPDATE) وبقيد CHECK (qty_base >= 0) — وليس بفحص في الواجهة.
 */
class StockLedger
{
    public const BUCKET_AVAILABLE = 'available';
    public const BUCKET_INSPECTION = 'inspection';
    public const BUCKET_QUARANTINE = 'quarantine';
    public const BUCKET_DAMAGED = 'damaged';
    public const BUCKET_IN_TRANSIT = 'in_transit';

    /** الأرصدة التي تدخل في «المتاح للبيع» — الحجر والتالف وتحت الفحص خارجها. */
    public const SELLABLE_BUCKETS = [self::BUCKET_AVAILABLE];

    /**
     * تسجيل حركة مخزنية واحدة وتحديث الرصيد المجمّع تحت قفل.
     *
     * @param  array{company_id:int, item_id:int, warehouse_id:int, direction:string, qty_base:mixed,
     *               unit_cost:mixed, doc_type:string, doc_id:int, movement_date:string,
     *               location_id?:int|null, batch_id?:int|null, status_bucket?:string,
     *               doc_line_id?:int|null, doc_no?:string|null, uom_id?:int|null,
     *               uom_factor?:mixed, qty_in_uom?:mixed, created_by?:int|null, notes?:string|null}  $data
     */
    public function record(array $data): StockMovement
    {
        if (! DB::transactionLevel()) {
            throw DomainException::make(
                'stock.no_transaction',
                'حركة المخزون يجب أن تُسجَّل داخل معاملة قاعدة بيانات مع أثر المستند المالي.',
            );
        }

        $companyId = (int) $data['company_id'];
        $itemId = (int) $data['item_id'];
        $warehouseId = (int) $data['warehouse_id'];
        $bucket = $data['status_bucket'] ?? self::BUCKET_AVAILABLE;
        $direction = $data['direction'];
        $qty = Dec::round($data['qty_base'], Dec::SCALE_QTY);
        $unitCost = Dec::round($data['unit_cost'] ?? 0, Dec::SCALE_COST);
        $locationId = $data['location_id'] ?? null;
        $batchId = $data['batch_id'] ?? null;

        if (! in_array($direction, ['in', 'out'], true)) {
            throw DomainException::make('stock.invalid_direction', 'اتجاه الحركة يجب أن يكون in أو out.');
        }

        if (! $qty->isPositive()) {
            throw DomainException::make('stock.invalid_qty', 'كمية الحركة يجب أن تكون موجبة؛ الاتجاه هو ما يحدد الأثر.');
        }

        $this->assertSameCompany($companyId, $itemId, $warehouseId);

        $totalCost = Dec::round(Dec::mul($qty, $unitCost), Dec::SCALE_MONEY);

        $balance = $this->lockBalance($companyId, $itemId, $warehouseId, $locationId, $batchId, $bucket);

        $signedQty = $direction === 'in' ? $qty : Dec::neg($qty);
        $signedValue = $direction === 'in' ? $totalCost : Dec::neg($totalCost);

        $newQty = Dec::add($balance->qty_base, $signedQty);

        if ($newQty->isNegative()) {
            $warehouse = Warehouse::find($warehouseId);
            $item = Item::find($itemId);
            throw DomainException::make(
                'stock.insufficient',
                sprintf(
                    'الرصيد غير كافٍ: الصنف «%s» في مخزن «%s» (%s) رصيده %s والمطلوب %s.',
                    $item?->name_ar ?? $itemId,
                    $warehouse?->name ?? $warehouseId,
                    $this->bucketLabel($bucket),
                    Dec::qty($balance->qty_base),
                    Dec::qty($qty),
                ),
                [
                    'item_id' => $itemId,
                    'warehouse_id' => $warehouseId,
                    'status_bucket' => $bucket,
                    'available' => (string) $balance->qty_base,
                    'requested' => (string) $qty,
                ],
            );
        }

        $newValue = Dec::add($balance->total_value, $signedValue);
        if ($newQty->isZero()) {
            $newValue = Dec::of(0);
        }

        DB::table('stock_balances')->where('id', $balance->id)->update([
            'qty_base' => (string) Dec::round($newQty, Dec::SCALE_QTY),
            'total_value' => (string) Dec::round($newValue, Dec::SCALE_MONEY),
            'updated_at' => now(),
        ]);

        return StockMovement::create([
            'company_id' => $companyId,
            'item_id' => $itemId,
            'warehouse_id' => $warehouseId,
            'location_id' => $locationId,
            'batch_id' => $batchId,
            'status_bucket' => $bucket,
            'doc_type' => $data['doc_type'],
            'doc_id' => $data['doc_id'],
            'doc_line_id' => $data['doc_line_id'] ?? null,
            'doc_no' => $data['doc_no'] ?? null,
            'direction' => $direction,
            'qty_base' => (string) $qty,
            'uom_id' => $data['uom_id'] ?? null,
            'uom_factor' => (string) Dec::round($data['uom_factor'] ?? 1, Dec::SCALE_QTY),
            'qty_in_uom' => isset($data['qty_in_uom']) ? (string) Dec::round($data['qty_in_uom'], Dec::SCALE_QTY) : null,
            'unit_cost' => (string) $unitCost,
            'total_cost' => (string) $totalCost,
            'movement_date' => $data['movement_date'],
            'posted_at' => now(),
            'created_by' => $data['created_by'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);
    }

    /**
     * إعادة تصنيف كمية بين حالات داخل نفس المخزن (فحص ← صالح للبيع، أو ← تالف).
     * لا تغيّر الكمية الإجمالية ولا التكلفة.
     */
    public function reclassify(array $data): array
    {
        $out = $this->record(array_merge($data, [
            'direction' => 'out',
            'status_bucket' => $data['from_status_bucket'],
        ]));

        $in = $this->record(array_merge($data, [
            'direction' => 'in',
            'status_bucket' => $data['to_status_bucket'],
        ]));

        return [$out, $in];
    }

    /** قفل صف الرصيد وإنشاؤه إن لم يوجد — آمن تحت التزامن. */
    private function lockBalance(int $companyId, int $itemId, int $warehouseId, ?int $locationId, ?int $batchId, string $bucket): object
    {
        $find = fn () => DB::table('stock_balances')
            ->where('company_id', $companyId)
            ->where('item_id', $itemId)
            ->where('warehouse_id', $warehouseId)
            ->where('status_bucket', $bucket)
            ->when($locationId === null, fn ($q) => $q->whereNull('location_id'), fn ($q) => $q->where('location_id', $locationId))
            ->when($batchId === null, fn ($q) => $q->whereNull('batch_id'), fn ($q) => $q->where('batch_id', $batchId))
            ->lockForUpdate()
            ->first();

        $row = $find();

        if ($row) {
            return $row;
        }

        DB::statement(
            'INSERT INTO stock_balances
                (company_id, item_id, warehouse_id, location_id, batch_id, status_bucket, qty_base, total_value, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, 0, NOW(), NOW())
             ON CONFLICT DO NOTHING',
            [$companyId, $itemId, $warehouseId, $locationId, $batchId, $bucket],
        );

        $row = $find();

        if (! $row) {
            throw DomainException::make('stock.balance_lock_failed', 'تعذّر تهيئة صف الرصيد المخزني.');
        }

        return $row;
    }

    private function assertSameCompany(int $companyId, int $itemId, int $warehouseId): void
    {
        $itemCompany = DB::table('items')->where('id', $itemId)->value('company_id');
        $warehouseCompany = DB::table('warehouses')->where('id', $warehouseId)->value('company_id');

        if ((int) $itemCompany !== $companyId || (int) $warehouseCompany !== $companyId) {
            throw DomainException::make(
                'stock.cross_company',
                'لا يُسمح بربط صنف أو مخزن يتبع شركة أخرى في نفس الحركة.',
            );
        }
    }

    private function bucketLabel(string $bucket): string
    {
        return match ($bucket) {
            self::BUCKET_AVAILABLE => 'صالح للبيع',
            self::BUCKET_INSPECTION => 'تحت الفحص',
            self::BUCKET_QUARANTINE => 'حجر',
            self::BUCKET_DAMAGED => 'تالف',
            self::BUCKET_IN_TRANSIT => 'بالطريق',
            default => $bucket,
        };
    }
}
