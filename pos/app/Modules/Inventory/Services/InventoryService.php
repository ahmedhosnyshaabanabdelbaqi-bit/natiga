<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Services;

use App\Modules\Catalog\Models\Product;
use App\Modules\Catalog\Models\ProductVariant;
use App\Modules\Core\Services\PosContext;
use App\Modules\Inventory\Models\StockBalance;
use App\Modules\Inventory\Models\StockMovement;
use App\Support\Exceptions\InsufficientStockException;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use App\Support\Quantity;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The single writer of stock.
 *
 * Every quantity change goes through `record()`, which:
 *   1. takes a row lock on (warehouse, variant) so concurrent cashiers serialise
 *      on the item they are fighting over, and nothing else;
 *   2. refuses to go negative unless the product/policy explicitly allows it;
 *   3. recomputes the moving-average cost;
 *   4. writes an immutable ledger row AND updates the derived balance.
 *
 * `stock_balances` is a projection: `rebuildBalance()` can reconstruct it from
 * `stock_movements` at any time, and the reconciliation report compares them.
 *
 * Callers MUST already be inside a database transaction for money-moving flows.
 */
class InventoryService
{
    public const REASON_SALE = 'sale';

    public const REASON_SALE_RETURN = 'sale_return';

    public const REASON_PURCHASE_RECEIPT = 'purchase_receipt';

    public const REASON_PURCHASE_RETURN = 'purchase_return';

    public const REASON_TRANSFER_OUT = 'transfer_out';

    public const REASON_TRANSFER_IN = 'transfer_in';

    public const REASON_STOCKTAKE = 'stocktake';

    public const REASON_ADJUSTMENT = 'adjustment';

    public const REASON_OPENING = 'opening';

    public const REASON_DAMAGE = 'damage';

    public function __construct(private readonly PosContext $context) {}

    /**
     * Apply one signed movement, in BASE units.
     *
     * @param  Quantity  $qtyBase  positive = into the warehouse, negative = out
     * @param  Money|null  $unitCost  required for inbound; ignored for outbound
     *                                (outbound is always valued at the running
     *                                average, never at today's purchase price)
     */
    public function record(
        int $warehouseId,
        ProductVariant $variant,
        Quantity $qtyBase,
        string $reason,
        ?Money $unitCost = null,
        ?string $sourceType = null,
        ?int $sourceId = null,
        ?int $sourceLineId = null,
        ?int $productUnitId = null,
        ?Quantity $enteredQty = null,
        ?int $batchId = null,
        ?int $serialId = null,
        ?string $note = null,
        bool $allowNegative = false,
    ): StockMovement {
        if ($qtyBase->isZero()) {
            throw new InvalidOperationException('لا يمكن تسجيل حركة مخزون بكمية صفرية.', 'zero_movement');
        }

        $product = $variant->relationLoaded('product') ? $variant->product : $variant->product()->first();

        if (! $product->isStocked()) {
            throw new InvalidOperationException(
                'المنتج غير مخزني ولا يقبل حركات مخزون.',
                'product_not_stocked',
                422,
                ['product_id' => $product->id],
            );
        }

        $balance = $this->lockBalance($warehouseId, $variant->id, $product->id);

        $current = Quantity::of($balance->qty_on_hand);
        $newQty = $current->plus($qtyBase);

        if ($newQty->isNegative() && ! $this->negativeAllowed($product, $allowNegative)) {
            throw new InsufficientStockException(
                'الرصيد المتاح لا يكفي لإتمام العملية.',
                'insufficient_stock',
                422,
                [
                    'variant_id' => $variant->id,
                    'warehouse_id' => $warehouseId,
                    'available' => $current->toString(),
                    'requested' => $qtyBase->abs()->toString(),
                ],
            );
        }

        $currentAvg = Money::of($balance->avg_cost);
        [$movementCost, $newAvg] = $this->resolveCost($current, $currentAvg, $qtyBase, $unitCost);

        $movement = StockMovement::query()->create([
            'uuid' => (string) Str::uuid7(),
            'warehouse_id' => $warehouseId,
            'variant_id' => $variant->id,
            'product_id' => $product->id,
            'product_unit_id' => $productUnitId,
            'qty' => ($enteredQty ?? $qtyBase)->toString(),
            'qty_base' => $qtyBase->toString(),
            'unit_cost' => $movementCost->toString(6),
            'total_cost' => $movementCost->multipliedBy($qtyBase->abs())->toString(4),
            'balance_after' => $newQty->toString(),
            'avg_cost_after' => $newAvg->toString(6),
            'reason' => $reason,
            'source_type' => $sourceType,
            'source_id' => $sourceId,
            'source_line_id' => $sourceLineId,
            'batch_id' => $batchId,
            'serial_id' => $serialId,
            'user_id' => $this->context->userId(),
            'terminal_id' => $this->context->terminalId(),
            'branch_id' => $this->context->branchId(),
            'note' => $note,
            'occurred_at' => now(),
        ]);

        $balance->forceFill([
            'qty_on_hand' => $newQty->toString(),
            'avg_cost' => $newAvg->toString(6),
            'last_movement_at' => now(),
        ])->save();

        return $movement;
    }

    /**
     * Moving weighted average.
     *
     * Inbound  : avg = (qty*avg + inQty*inCost) / (qty + inQty)
     * Outbound : avg unchanged, movement valued at the current avg.
     *
     * @return array{0: Money, 1: Money} [cost used for this movement, new average]
     */
    private function resolveCost(Quantity $current, Money $currentAvg, Quantity $qtyBase, ?Money $unitCost): array
    {
        if ($qtyBase->isNegative()) {
            // Issues take the running average; a caller may force a specific
            // cost (a return reversing its original COGS does exactly that).
            $cost = $unitCost ?? $currentAvg;

            return [$cost, $currentAvg];
        }

        $inCost = $unitCost ?? $currentAvg;
        $newQty = $current->plus($qtyBase);

        // With a non-positive resulting balance a weighted average is
        // meaningless; keep the incoming cost as the new reference.
        if (! $newQty->isPositive()) {
            return [$inCost, $inCost];
        }

        // Negative stock (allowed by policy) has no meaningful average to blend.
        if (! $current->isPositive()) {
            return [$inCost, $inCost];
        }

        $totalValue = $currentAvg->multipliedBy($current)->plus($inCost->multipliedBy($qtyBase));
        $newAvg = $totalValue->dividedBy($newQty);

        return [$inCost, $newAvg];
    }

    /**
     * Lock the balance row for (warehouse, variant), creating it if missing.
     * The insert is ON CONFLICT DO NOTHING so two cashiers touching a brand-new
     * item at the same moment do not deadlock or error.
     */
    private function lockBalance(int $warehouseId, int $variantId, int $productId): StockBalance
    {
        $balance = StockBalance::query()
            ->where('warehouse_id', $warehouseId)
            ->where('variant_id', $variantId)
            ->lockForUpdate()
            ->first();

        if ($balance) {
            return $balance;
        }

        DB::statement(
            'INSERT INTO stock_balances (warehouse_id, variant_id, product_id, qty_on_hand, qty_reserved, avg_cost, created_at, updated_at)
             VALUES (?, ?, ?, 0, 0, 0, now(), now())
             ON CONFLICT (warehouse_id, variant_id) DO NOTHING',
            [$warehouseId, $variantId, $productId],
        );

        return StockBalance::query()
            ->where('warehouse_id', $warehouseId)
            ->where('variant_id', $variantId)
            ->lockForUpdate()
            ->firstOrFail();
    }

    private function negativeAllowed(Product $product, bool $callerOverride): bool
    {
        if ($callerOverride) {
            return true;
        }

        return $product->allow_negative_stock || (bool) config('pos.features.negative_stock', false);
    }

    public function available(int $warehouseId, int $variantId): Quantity
    {
        $balance = StockBalance::query()
            ->where('warehouse_id', $warehouseId)
            ->where('variant_id', $variantId)
            ->first();

        if (! $balance) {
            return Quantity::zero();
        }

        return Quantity::of($balance->qty_on_hand)->minus(Quantity::of($balance->qty_reserved));
    }

    public function averageCost(int $warehouseId, int $variantId): Money
    {
        $balance = StockBalance::query()
            ->where('warehouse_id', $warehouseId)
            ->where('variant_id', $variantId)
            ->first();

        return Money::of($balance?->avg_cost ?? '0');
    }

    /**
     * Recompute one balance from the movement ledger. Used by the reconciliation
     * report and after a restore, so the derived table can always be proven.
     */
    public function rebuildBalance(int $warehouseId, int $variantId): StockBalance
    {
        return DB::transaction(function () use ($warehouseId, $variantId): StockBalance {
            $productId = (int) ProductVariant::query()->whereKey($variantId)->value('product_id');
            $balance = $this->lockBalance($warehouseId, $variantId, $productId);

            $movements = StockMovement::query()
                ->where('warehouse_id', $warehouseId)
                ->where('variant_id', $variantId)
                ->orderBy('id')
                ->cursor();

            $qty = Quantity::zero();
            $avg = Money::zero();

            foreach ($movements as $movement) {
                $delta = Quantity::of($movement->qty_base);
                [, $avg] = $this->resolveCost($qty, $avg, $delta, Money::of($movement->unit_cost));
                $qty = $qty->plus($delta);
            }

            $balance->forceFill([
                'qty_on_hand' => $qty->toString(),
                'avg_cost' => $avg->toString(6),
            ])->save();

            return $balance;
        });
    }

    /**
     * Rows where the derived balance disagrees with the ledger.
     *
     * @return array<int,array<string,string>>
     */
    public function reconcile(?int $warehouseId = null): array
    {
        $sql = <<<'SQL'
        SELECT b.warehouse_id, b.variant_id, b.qty_on_hand AS balance_qty,
               COALESCE(m.total, 0) AS ledger_qty
        FROM stock_balances b
        LEFT JOIN (
            SELECT warehouse_id, variant_id, SUM(qty_base) AS total
            FROM stock_movements GROUP BY warehouse_id, variant_id
        ) m ON m.warehouse_id = b.warehouse_id AND m.variant_id = b.variant_id
        WHERE b.qty_on_hand <> COALESCE(m.total, 0)
        SQL;

        $bindings = [];
        if ($warehouseId !== null) {
            $sql .= ' AND b.warehouse_id = ?';
            $bindings[] = $warehouseId;
        }

        return array_map(fn ($r) => (array) $r, DB::select($sql, $bindings));
    }

    /** Convert an entered quantity in a selling unit to base units. */
    public function toBase(Quantity $qty, string|BigDecimal $factor): Quantity
    {
        $f = $factor instanceof BigDecimal ? $factor : BigDecimal::of((string) $factor);

        return Quantity::of($qty->toBigDecimal()->multipliedBy($f)->toScale(Quantity::SCALE, RoundingMode::HalfUp));
    }
}
