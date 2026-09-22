<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Services;

use App\Modules\Access\Services\AuditService;
use App\Modules\Accounting\Services\PostingService;
use App\Modules\Catalog\Models\ProductVariant;
use App\Modules\Core\Services\PosContext;
use App\Modules\Core\Services\SequenceService;
use App\Modules\Inventory\Models\StockBalance;
use App\Modules\Inventory\Models\StockMovement;
use App\Modules\Inventory\Models\Stocktake;
use App\Modules\Inventory\Models\StocktakeLine;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Support\Facades\DB;

/**
 * Stocktaking (physical count).
 *
 * The shop does not stop selling while it counts, so this service freezes a
 * snapshot when counting starts, then — at posting time — adds back every
 * movement that happened DURING the count before computing the variance:
 *
 *   variance = counted - (snapshot + movements while counting)
 *
 * Without that correction a sale made mid-count would look like shrinkage.
 */
class StocktakeService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly PostingService $posting,
        private readonly SequenceService $sequences,
        private readonly AuditService $audit,
        private readonly PosContext $context,
    ) {}

    /** @param array<string,mixed> $data */
    public function start(array $data): Stocktake
    {
        return DB::transaction(function () use ($data): Stocktake {
            $stocktake = Stocktake::query()->create([
                'number' => $this->sequences->next('stocktake'),
                'warehouse_id' => $data['warehouse_id'],
                'scope' => $data['scope'] ?? 'full',
                'status' => 'counting',
                'filters' => array_filter([
                    'variant_ids' => $data['variant_ids'] ?? null,
                    'category_id' => $data['category_id'] ?? null,
                ]),
                'created_by' => $this->context->userId(),
                'started_at' => now(),
            ]);

            $balances = StockBalance::query()
                ->where('warehouse_id', $data['warehouse_id'])
                ->when(! empty($data['variant_ids']), fn ($q) => $q->whereIn('variant_id', $data['variant_ids']))
                ->when(! empty($data['category_id']), fn ($q) => $q->whereHas('product', fn ($p) => $p->where('category_id', $data['category_id'])))
                ->get();

            foreach ($balances as $balance) {
                StocktakeLine::query()->create([
                    'stocktake_id' => $stocktake->id,
                    'variant_id' => $balance->variant_id,
                    'snapshot_qty' => $balance->qty_on_hand,
                    'unit_cost' => $balance->avg_cost,
                ]);
            }

            $this->audit->log('stocktake.started', $stocktake, null, [
                'number' => $stocktake->number,
                'lines' => $balances->count(),
            ]);

            return $stocktake->load('lines');
        });
    }

    /** @param list<array{variant_id:int, counted_qty:string}> $counts */
    public function count(int $stocktakeId, array $counts): Stocktake
    {
        return DB::transaction(function () use ($stocktakeId, $counts): Stocktake {
            $stocktake = Stocktake::query()->whereKey($stocktakeId)->firstOrFail();

            if ($stocktake->status !== 'counting') {
                throw new InvalidOperationException('الجرد ليس في مرحلة العد.', 'stocktake_not_counting', 409);
            }

            foreach ($counts as $count) {
                StocktakeLine::query()->updateOrCreate(
                    ['stocktake_id' => $stocktake->id, 'variant_id' => $count['variant_id']],
                    [
                        'counted_qty' => Quantity::of($count['counted_qty'])->toString(),
                        'counted_by' => $this->context->userId(),
                        'counted_at' => now(),
                    ],
                );
            }

            return $stocktake->refresh()->load('lines');
        });
    }

    /**
     * Post the variances as documented stock movements.
     * Never a silent balance rewrite.
     */
    public function post(int $stocktakeId, ?string $notes = null): Stocktake
    {
        return DB::transaction(function () use ($stocktakeId, $notes): Stocktake {
            $stocktake = Stocktake::query()->with('lines')->whereKey($stocktakeId)->lockForUpdate()->firstOrFail();

            if ($stocktake->status === 'posted') {
                throw new InvalidOperationException('تم اعتماد هذا الجرد بالفعل.', 'stocktake_already_posted', 409);
            }

            $upValue = Money::zero();
            $downValue = Money::zero();

            foreach ($stocktake->lines as $line) {
                if ($line->counted_qty === null) {
                    continue; // never counted: leave the balance alone
                }

                // Movements recorded between the snapshot and now.
                $duringCount = StockMovement::query()
                    ->where('warehouse_id', $stocktake->warehouse_id)
                    ->where('variant_id', $line->variant_id)
                    ->where('occurred_at', '>=', $stocktake->started_at)
                    ->sum('qty_base');

                $delta = Quantity::of((string) $duringCount);
                $expected = Quantity::of($line->snapshot_qty)->plus($delta);
                $variance = Quantity::of($line->counted_qty)->minus($expected);

                $line->forceFill([
                    'movement_delta_qty' => $delta->toString(),
                    'variance_qty' => $variance->toString(),
                ])->save();

                if ($variance->isZero()) {
                    continue;
                }

                $variant = ProductVariant::query()->with('product')->findOrFail($line->variant_id);

                $movement = $this->inventory->record(
                    warehouseId: (int) $stocktake->warehouse_id,
                    variant: $variant,
                    qtyBase: $variance,
                    reason: InventoryService::REASON_STOCKTAKE,
                    unitCost: Money::of($line->unit_cost),
                    sourceType: Stocktake::class,
                    sourceId: $stocktake->id,
                    sourceLineId: $line->id,
                    note: 'فرق جرد '.$stocktake->number,
                    allowNegative: true, // the count is the truth, by definition
                );

                $value = Money::of($movement->total_cost);
                $variance->isPositive() ? $upValue = $upValue->plus($value) : $downValue = $downValue->plus($value);
            }

            $net = $upValue->minus($downValue);
            if (! $net->isZero()) {
                $this->posting->post('stocktake', $stocktake, $net->isPositive()
                    ? [
                        ['account' => PostingService::INVENTORY, 'debit' => $net, 'memo' => 'زيادة جرد'],
                        ['account' => PostingService::INVENTORY_VARIANCE, 'credit' => $net, 'memo' => 'فروق جرد'],
                    ]
                    : [
                        ['account' => PostingService::INVENTORY_VARIANCE, 'debit' => $net->abs(), 'memo' => 'عجز جرد'],
                        ['account' => PostingService::INVENTORY, 'credit' => $net->abs(), 'memo' => 'فروق جرد'],
                    ], 'فروق جرد '.$stocktake->number);
            }

            $stocktake->forceFill([
                'status' => 'posted',
                'posted_at' => now(),
                'posted_by' => $this->context->userId(),
                'notes' => $notes,
            ])->save();

            $this->audit->log('stocktake.posted', $stocktake, null, [
                'number' => $stocktake->number,
                'surplus_value' => $upValue->toString(),
                'shortage_value' => $downValue->toString(),
            ], $notes);

            return $stocktake->refresh()->load('lines');
        });
    }

    /** @return array<string,mixed> */
    public function show(int $stocktakeId): array
    {
        $stocktake = Stocktake::query()->with(['lines.variant.product:id,name', 'warehouse:id,name'])->findOrFail($stocktakeId);

        return [
            'stocktake' => $stocktake,
            'summary' => [
                'lines' => $stocktake->lines->count(),
                'counted' => $stocktake->lines->whereNotNull('counted_qty')->count(),
                'variances' => $stocktake->lines->filter(fn ($l) => (string) $l->variance_qty !== '0.0000')->count(),
            ],
        ];
    }
}
