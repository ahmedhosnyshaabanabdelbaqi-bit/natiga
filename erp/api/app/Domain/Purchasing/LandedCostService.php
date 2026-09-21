<?php

namespace App\Domain\Purchasing;

use App\Domain\Accounting\LedgerService;
use App\Domain\Inventory\InventoryService;
use App\Domain\Support\DocumentNumbering;
use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Models\GoodsReceipt;
use App\Models\LandedCost;
use App\Models\LandedCostAllocation;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * Freight, clearance and handling charged onto the cost of purchased goods.
 *
 * The hard part is a cost that arrives after some of the goods have already
 * been sold. This service splits each allocation by what is still on hand:
 *
 *   still on hand → lifts the moving average (Dr Inventory)
 *   already sold  → charged to cost of sales now (Dr COGS)
 *
 * Old invoices and old margins are not restated. The split is recorded on the
 * allocation row so the treatment is auditable, not silent.
 */
class LandedCostService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly LedgerService $ledger,
        private readonly DocumentNumbering $numbering,
    ) {}

    /**
     * @param  array<int, int>  $goodsReceiptIds  receipts this cost belongs to
     */
    public function create(array $header, array $goodsReceiptIds): LandedCost
    {
        if ($goodsReceiptIds === []) {
            throw DomainException::make('purchasing.landed_cost_no_receipts',
                'يجب تحديد إذن استلام واحد على الأقل لتوزيع التكلفة عليه.');
        }

        return DB::transaction(function () use ($header, $goodsReceiptIds) {
            $cost = LandedCost::create([
                'company_id' => CompanyContext::idOrFail(),
                'code' => $this->numbering->next('landed_cost'),
                'cost_date' => $header['cost_date'] ?? now()->toDateString(),
                'kind' => $header['kind'] ?? 'freight',
                'supplier_id' => $header['supplier_id'] ?? null,
                'amount' => Num::money($header['amount']),
                'allocation_method' => $header['allocation_method'] ?? 'value',
                'status' => 'draft',
                'notes' => $header['notes'] ?? null,
            ]);

            $this->buildAllocations($cost, $goodsReceiptIds);

            return $cost->fresh(['allocations']);
        });
    }

    /**
     * Weight each receipt line and split the cost across them.
     *
     * Num::allocate gives the rounding residue to the largest weight, so the
     * allocations always add back to the charged amount exactly.
     */
    protected function buildAllocations(LandedCost $cost, array $goodsReceiptIds): void
    {
        $receipts = GoodsReceipt::with('lines.item')
            ->whereIn('id', $goodsReceiptIds)
            ->where('status', 'posted')
            ->get();

        if ($receipts->isEmpty()) {
            throw DomainException::make('purchasing.landed_cost_receipts_unposted',
                'أذون الاستلام المحددة غير مرحّلة.', ['receipt_ids' => $goodsReceiptIds]);
        }

        $weights = [];
        $lines = [];

        foreach ($receipts as $receipt) {
            foreach ($receipt->lines as $line) {
                $weight = match ($cost->allocation_method) {
                    'qty' => (string) $line->qty_base,
                    'weight' => Num::mul($line->qty_base, $line->item->weight_kg ?? '0'),
                    default => (string) $line->value,
                };

                $weights[$line->id] = $weight;
                $lines[$line->id] = $line;
            }
        }

        $shares = Num::allocate((string) $cost->amount, $weights, 4);

        foreach ($shares as $lineId => $share) {
            if (Num::isZero($share, 4)) {
                continue;
            }

            $line = $lines[$lineId];

            // How much of this receipt's goods is still in stock right now.
            $onHandNow = $this->inventory->currentOnHandForItem($line->item_id);
            $stillOnHand = Num::min($onHandNow, (string) $line->qty_base);

            LandedCostAllocation::create([
                'landed_cost_id' => $cost->id,
                'goods_receipt_line_id' => $line->id,
                'item_id' => $line->item_id,
                'basis' => Num::round($weights[$lineId], 4),
                'amount' => Num::round($share, 4),
                'qty_remaining_base' => Num::qty($stillOnHand),
            ]);
        }
    }

    public function post(LandedCost $cost): LandedCost
    {
        return DB::transaction(function () use ($cost) {
            $cost = LandedCost::with('allocations')->lockForUpdate()->findOrFail($cost->id);

            if ($cost->status === 'posted') {
                return $cost;
            }
            if ($cost->allocations->isEmpty()) {
                throw DomainException::make('purchasing.landed_cost_empty',
                    'لا توجد بنود لتوزيع التكلفة عليها.', ['landed_cost_id' => $cost->id]);
            }

            $toInventory = '0';
            $toCogs = '0';

            foreach ($cost->allocations as $allocation) {
                $line = $allocation->goodsReceiptLine;

                $split = $this->inventory->applyLateCost(
                    itemId: $allocation->item_id,
                    amount: (string) $allocation->amount,
                    qtyStillOnHand: (string) $allocation->qty_remaining_base,
                    qtyOriginal: (string) $line->qty_base,
                );

                $allocation->forceFill([
                    'to_inventory' => $split['to_inventory'],
                    'to_cogs' => $split['to_cogs'],
                ])->save();

                $toInventory = Num::add($toInventory, $split['to_inventory'], Num::MONEY_SCALE);
                $toCogs = Num::add($toCogs, $split['to_cogs'], Num::MONEY_SCALE);

                // Keep the receipt line's own record of what it ended up costing.
                $line->forceFill([
                    'landed_cost_value' => Num::round(
                        Num::add($line->landed_cost_value, $allocation->amount, 4), 4
                    ),
                ])->save();
            }

            $accounts = $this->ledger->accounts();
            $draft = $this->ledger->draftFor(
                'landed_cost', $cost->id, $cost->cost_date->toDateString(),
                "تكلفة إضافية {$cost->code} ({$cost->kind})"
            );

            if (Num::isPositive($toInventory, Num::MONEY_SCALE)) {
                $draft->debit($accounts->key('inventory'), $toInventory,
                    'تحميل تكلفة على المخزون القائم');
            }
            if (Num::isPositive($toCogs, Num::MONEY_SCALE)) {
                $draft->debit($accounts->key('cogs'), $toCogs,
                    'تحميل تكلفة على البضاعة المباعة');
            }

            if ($cost->supplier_id) {
                $draft->credit($accounts->forSupplier($cost->supplier_id), $cost->amount,
                    'مستحق مقدم الخدمة', 'supplier', $cost->supplier_id);
            } else {
                $draft->credit($accounts->key('accounts_payable'), $cost->amount, 'مستحق تكلفة إضافية');
            }

            $difference = $draft->difference();
            if (! Num::isZero($difference, Num::MONEY_SCALE)) {
                $draft->signed($accounts->key('rounding_difference'),
                    Num::neg($difference, Num::MONEY_SCALE), 'debit', 'فروق تقريب');
            }

            $entry = $this->ledger->post($draft);

            $cost->forceFill([
                'status' => 'posted',
                'allocated_to_inventory' => Num::money($toInventory),
                'allocated_to_cogs' => Num::money($toCogs),
                'journal_entry_id' => $entry->id,
            ])->save();

            return $cost->fresh(['allocations']);
        });
    }
}
