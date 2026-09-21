<?php

namespace App\Domain\Purchasing;

use App\Domain\Inventory\StockQuery;
use App\Domain\Support\Num;
use App\Support\CompanyContext;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Replenishment suggestions.
 *
 * Suggested quantity = cover for the lead time, based on recent consumption,
 * plus the reorder point, minus what is available and already on order. A
 * suggestion is never produced for an item whose open purchase orders already
 * cover the gap — that is the duplicate-order trap this exists to avoid.
 */
class ReorderService
{
    public function __construct(private readonly StockQuery $stock) {}

    /** @return Collection<int, array<string, mixed>> */
    public function suggestions(?int $warehouseId = null, int $lookbackDays = 90): Collection
    {
        $companyId = CompanyContext::idOrFail();
        $since = now()->subDays($lookbackDays)->toDateString();

        $consumption = DB::table('stock_movements')
            ->where('company_id', $companyId)
            ->where('direction', 'out')
            ->whereIn('reason', ['sale_delivery', 'sale_direct', 'sale_bonus'])
            ->where('moved_at', '>=', $since.' 00:00:00')
            ->groupBy('item_id')
            ->selectRaw('item_id, SUM(qty_base) AS qty')
            ->pluck('qty', 'item_id');

        return $this->stock->belowReorderPoint($warehouseId)->map(function ($row) use ($consumption, $lookbackDays) {
            $used = Num::of($consumption[$row->id] ?? '0');
            $dailyRate = Num::div($used, (string) $lookbackDays, Num::QTY_SCALE);
            $leadCover = Num::mul($dailyRate, (string) max(1, (int) $row->lead_time_days), Num::QTY_SCALE);

            $target = Num::add($leadCover, (string) $row->reorder_point, Num::QTY_SCALE);
            $gap = Num::sub(
                Num::sub($target, (string) $row->available, Num::QTY_SCALE),
                (string) $row->on_order,
                Num::QTY_SCALE
            );

            // Open orders already cover the need — no suggestion.
            if (! Num::isPositive($gap, Num::QTY_SCALE)) {
                return null;
            }

            $suggested = Num::isPositive($row->reorder_qty, Num::QTY_SCALE)
                // Round the shortfall up to whole reorder multiples.
                ? Num::qty(Num::mul(
                    Num::add(Num::intDiv($gap, $row->reorder_qty), '1', 0),
                    $row->reorder_qty,
                    Num::QTY_SCALE
                ))
                : Num::qty($gap);

            return [
                'item_id' => $row->id,
                'code' => $row->code,
                'name' => $row->name,
                'available' => Num::qty($row->available),
                'on_order' => Num::qty($row->on_order),
                'reorder_point' => Num::qty($row->reorder_point),
                'daily_consumption' => Num::qty($dailyRate),
                'lead_time_days' => (int) $row->lead_time_days,
                'gap' => Num::qty($gap),
                'suggested_qty' => $suggested,
            ];
        })->filter()->values();
    }
}
