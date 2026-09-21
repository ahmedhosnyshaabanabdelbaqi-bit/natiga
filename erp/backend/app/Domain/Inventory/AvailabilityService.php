<?php

namespace App\Domain\Inventory;

use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * الرصيد الفعلي / المحجوز / المتاح.
 * المتاح = الرصيد الصالح للبيع − الحجوزات النشطة. الحجر والتالف وتحت الفحص لا تُضم للمتاح.
 */
class AvailabilityService
{
    /** @return array{on_hand:string, reserved:string, available:string, non_sellable:string} */
    public function forItem(int $companyId, int $itemId, ?int $warehouseId = null, ?int $batchId = null): array
    {
        $balanceQuery = DB::table('stock_balances')
            ->where('company_id', $companyId)
            ->where('item_id', $itemId)
            ->when($warehouseId !== null, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->when($batchId !== null, fn ($q) => $q->where('batch_id', $batchId));

        $onHand = (clone $balanceQuery)
            ->whereIn('status_bucket', StockLedger::SELLABLE_BUCKETS)
            ->sum('qty_base');

        $nonSellable = (clone $balanceQuery)
            ->whereNotIn('status_bucket', StockLedger::SELLABLE_BUCKETS)
            ->sum('qty_base');

        $reserved = DB::table('stock_reservations')
            ->where('company_id', $companyId)
            ->where('item_id', $itemId)
            ->where('status', 'active')
            ->when($warehouseId !== null, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->when($batchId !== null, fn ($q) => $q->where('batch_id', $batchId))
            ->sum('qty_base');

        $available = Dec::max(Dec::sub($onHand, $reserved), 0);

        return [
            'on_hand' => Dec::qty($onHand),
            'reserved' => Dec::qty($reserved),
            'available' => Dec::qty($available),
            'non_sellable' => Dec::qty($nonSellable),
        ];
    }

    /** الكمية في مخزن معيّن بحالة معيّنة. */
    public function bucketQty(int $companyId, int $itemId, int $warehouseId, string $bucket): string
    {
        return Dec::qty(
            DB::table('stock_balances')
                ->where('company_id', $companyId)
                ->where('item_id', $itemId)
                ->where('warehouse_id', $warehouseId)
                ->where('status_bucket', $bucket)
                ->sum('qty_base')
        );
    }

    /**
     * دفعات الصنف مرتبة بالأقرب انتهاءً (FEFO) — للصرف من الأصناف ذات الصلاحية.
     *
     * @return array<int, array{batch_id:int|null, qty:string, expiry_date:string|null}>
     */
    public function fefoBatches(int $companyId, int $itemId, int $warehouseId): array
    {
        return DB::table('stock_balances as sb')
            ->leftJoin('stock_batches as b', 'b.id', '=', 'sb.batch_id')
            ->where('sb.company_id', $companyId)
            ->where('sb.item_id', $itemId)
            ->where('sb.warehouse_id', $warehouseId)
            ->where('sb.status_bucket', StockLedger::BUCKET_AVAILABLE)
            ->where('sb.qty_base', '>', 0)
            ->orderByRaw('b.expiry_date ASC NULLS LAST')
            ->get(['sb.batch_id', 'sb.qty_base as qty', 'b.expiry_date'])
            ->map(fn ($r) => [
                'batch_id' => $r->batch_id !== null ? (int) $r->batch_id : null,
                'qty' => Dec::qty($r->qty),
                'expiry_date' => $r->expiry_date,
            ])
            ->all();
    }
}
