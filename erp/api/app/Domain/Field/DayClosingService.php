<?php

namespace App\Domain\Field;

use App\Domain\Accounting\LedgerService;
use App\Domain\Inventory\InventoryService;
use App\Domain\Support\DocumentNumbering;
use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Models\DayClosing;
use App\Models\DayClosingStockLine;
use App\Models\StockAdjustment;
use App\Models\StockAdjustmentLine;
use App\Models\User;
use App\Models\Warehouse;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * End-of-day reconciliation for a rep.
 *
 * Two equations, computed from movements and ledger balances — never typed in.
 *
 * GOODS (per item, in base units):
 *   opening
 * + loaded + transferred in + customer returns received
 * − sold − bonus given − returned to warehouse − transferred out − damaged
 * = expected
 *
 * The expected figure is then broken down into sellable / reserved / under
 * inspection, because "you should have 40" is not the same claim as "you should
 * have 40 you can sell".
 *
 * CASH:
 *   opening
 * + cash receipts + cash custody received
 * − approved deposits − approved cash expenses − cash refunds to customers
 * = expected cash
 *
 * Cheques and direct bank transfers are tracked separately and never added to
 * cash on hand — a cheque in the rep's pocket is not money in the box.
 *
 * Closing is not allowed while operations are still unsynced, unless an
 * authorised user records an explicit override with a reason.
 */
class DayClosingService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly LedgerService $ledger,
        private readonly DocumentNumbering $numbering,
    ) {}

    public function open(int $repId, string $businessDate, ?int $vehicleId = null): DayClosing
    {
        return DB::transaction(function () use ($repId, $businessDate, $vehicleId) {
            $existing = DayClosing::query()
                ->where('rep_id', $repId)
                ->where('business_date', $businessDate)
                ->first();

            if ($existing) {
                return $existing;
            }

            $vanWarehouse = $vehicleId
                ? Warehouse::query()->where('vehicle_id', $vehicleId)->where('kind', 'van')->first()
                : null;

            return DayClosing::create([
                'company_id' => CompanyContext::idOrFail(),
                'code' => $this->numbering->next('day_closing'),
                'business_date' => $businessDate,
                'rep_id' => $repId,
                'vehicle_id' => $vehicleId,
                'van_warehouse_id' => $vanWarehouse?->id,
                'status' => 'draft',
                'opened_by' => auth()->id(),
            ]);
        });
    }

    /**
     * Recompute both equations from source data.
     *
     * Safe to call repeatedly — it rebuilds the stock lines each time rather
     * than accumulating, so a supervisor can refresh after a late sync.
     */
    public function compute(DayClosing $closing): DayClosing
    {
        return DB::transaction(function () use ($closing) {
            $closing = DayClosing::lockForUpdate()->findOrFail($closing->id);

            if ($closing->isFinal()) {
                throw DomainException::make('field.day_closed',
                    "يوم المندوب «{$closing->code}» معتمد؛ أعد فتحه أولًا لإعادة الحساب.",
                    ['status' => $closing->status]);
            }

            $this->computeGoods($closing);
            $this->computeCash($closing);
            $this->computeActivity($closing);
            $this->computeSyncState($closing);

            return $closing->fresh(['stockLines']);
        });
    }

    protected function computeGoods(DayClosing $closing): void
    {
        $closing->stockLines()->delete();

        if (! $closing->van_warehouse_id) {
            return;
        }

        $date = $closing->business_date->toDateString();
        $from = $date.' 00:00:00';
        $to = $date.' 23:59:59';
        $warehouseId = $closing->van_warehouse_id;

        // Opening = everything that moved before today.
        $opening = DB::table('stock_movements')
            ->where('company_id', $closing->company_id)
            ->where('warehouse_id', $warehouseId)
            ->where('moved_at', '<', $from)
            ->groupBy('item_id', 'batch_id')
            ->selectRaw("
                item_id, batch_id,
                SUM(CASE WHEN direction = 'in' THEN qty_base ELSE -qty_base END) AS qty
            ")
            ->get()
            ->keyBy(fn ($r) => $r->item_id.':'.($r->batch_id ?? 0));

        // Today's movements, bucketed by the reason the engine recorded.
        $today = DB::table('stock_movements')
            ->where('company_id', $closing->company_id)
            ->where('warehouse_id', $warehouseId)
            ->whereBetween('moved_at', [$from, $to])
            ->groupBy('item_id', 'batch_id')
            ->selectRaw("
                item_id, batch_id,
                SUM(CASE WHEN direction = 'in'  AND reason IN ('van_load_receive','transfer_in') THEN qty_base ELSE 0 END) AS loaded,
                SUM(CASE WHEN direction = 'in'  AND reason LIKE 'customer_return%' THEN qty_base ELSE 0 END) AS customer_returns,
                SUM(CASE WHEN direction = 'in'  AND reason NOT IN ('van_load_receive','transfer_in') AND reason NOT LIKE 'customer_return%' THEN qty_base ELSE 0 END) AS other_in,
                SUM(CASE WHEN direction = 'out' AND reason IN ('sale_direct','sale_delivery') THEN qty_base ELSE 0 END) AS sold,
                SUM(CASE WHEN direction = 'out' AND reason = 'sale_bonus' THEN qty_base ELSE 0 END) AS bonus,
                SUM(CASE WHEN direction = 'out' AND reason = 'van_load_issue' THEN qty_base ELSE 0 END) AS returned_to_wh,
                SUM(CASE WHEN direction = 'out' AND reason IN ('damage','expiry') THEN qty_base ELSE 0 END) AS damaged,
                SUM(CASE WHEN direction = 'out' AND reason NOT IN ('sale_direct','sale_delivery','sale_bonus','van_load_issue','damage','expiry') THEN qty_base ELSE 0 END) AS other_out
            ")
            ->get()
            ->keyBy(fn ($r) => $r->item_id.':'.($r->batch_id ?? 0));

        $keys = $opening->keys()->merge($today->keys())->unique();

        $valued = [
            'opening' => '0', 'loaded' => '0', 'sold' => '0',
            'bonus' => '0', 'returned' => '0', 'damaged' => '0',
        ];

        foreach ($keys as $key) {
            [$itemId, $batchId] = array_pad(explode(':', $key), 2, null);
            $itemId = (int) $itemId;
            $batchId = ((int) $batchId) ?: null;

            $o = $opening->get($key);
            $t = $today->get($key);

            $openingQty = Num::qty($o->qty ?? '0');
            $loaded = Num::qty($t->loaded ?? '0');
            $transferIn = Num::qty($t->other_in ?? '0');
            $customerReturn = Num::qty($t->customer_returns ?? '0');
            $sold = Num::qty($t->sold ?? '0');
            $bonus = Num::qty($t->bonus ?? '0');
            $returnedToWh = Num::qty($t->returned_to_wh ?? '0');
            $transferOut = Num::qty($t->other_out ?? '0');
            $damaged = Num::qty($t->damaged ?? '0');

            // The goods equation, written exactly as documented.
            $expected = Num::qty(
                Num::sub(
                    Num::add(Num::add(Num::add($openingQty, $loaded, Num::QTY_SCALE),
                        $transferIn, Num::QTY_SCALE), $customerReturn, Num::QTY_SCALE),
                    Num::add(Num::add(Num::add(Num::add($sold, $bonus, Num::QTY_SCALE),
                        $returnedToWh, Num::QTY_SCALE), $transferOut, Num::QTY_SCALE),
                        $damaged, Num::QTY_SCALE),
                    Num::QTY_SCALE
                )
            );

            if (Num::isZero($expected, Num::QTY_SCALE)
                && Num::isZero($openingQty, Num::QTY_SCALE)
                && Num::isZero($loaded, Num::QTY_SCALE)) {
                continue;
            }

            $balance = DB::table('stock_balances')
                ->where('warehouse_id', $warehouseId)
                ->where('item_id', $itemId)
                ->whereRaw('COALESCE(batch_id, 0) = ?', [$batchId ?? 0])
                ->first();

            $reserved = Num::qty($balance->qty_reserved ?? '0');
            $unitCost = $this->inventory->currentAverageCost($itemId);

            DayClosingStockLine::create([
                'day_closing_id' => $closing->id,
                'item_id' => $itemId,
                'batch_id' => $batchId,
                'opening_qty' => $openingQty,
                'loaded_qty' => $loaded,
                'transfer_in_qty' => $transferIn,
                'customer_return_qty' => $customerReturn,
                'sold_qty' => $sold,
                'bonus_qty' => $bonus,
                'returned_to_wh_qty' => $returnedToWh,
                'transfer_out_qty' => $transferOut,
                'damaged_qty' => $damaged,
                'expected_qty' => $expected,
                // Breakdown of what the expected quantity consists of.
                'sellable_qty' => Num::qty(Num::max('0', Num::sub($expected, $reserved, Num::QTY_SCALE))),
                'reserved_qty' => $reserved,
                'under_inspection_qty' => '0',
                'unit_cost' => $unitCost,
            ]);

            $valued['opening'] = Num::add($valued['opening'], Num::mul($openingQty, $unitCost), Num::MONEY_SCALE);
            $valued['loaded'] = Num::add($valued['loaded'], Num::mul($loaded, $unitCost), Num::MONEY_SCALE);
            $valued['sold'] = Num::add($valued['sold'], Num::mul($sold, $unitCost), Num::MONEY_SCALE);
            $valued['bonus'] = Num::add($valued['bonus'], Num::mul($bonus, $unitCost), Num::MONEY_SCALE);
            $valued['returned'] = Num::add($valued['returned'], Num::mul($returnedToWh, $unitCost), Num::MONEY_SCALE);
            $valued['damaged'] = Num::add($valued['damaged'], Num::mul($damaged, $unitCost), Num::MONEY_SCALE);
        }

        $closing->forceFill([
            'goods_opening_value' => Num::money($valued['opening']),
            'goods_loaded_value' => Num::money($valued['loaded']),
            'goods_sold_value' => Num::money($valued['sold']),
            'goods_bonus_value' => Num::money($valued['bonus']),
            'goods_returned_value' => Num::money($valued['returned']),
            'goods_damaged_value' => Num::money($valued['damaged']),
        ])->save();
    }

    protected function computeCash(DayClosing $closing): void
    {
        $date = $closing->business_date->toDateString();
        $repId = $closing->rep_id;
        $companyId = $closing->company_id;

        // Opening is the rep's custody balance as the day began — straight from
        // the ledger, so it cannot drift from the accounts.
        $custodyAccountId = $this->ledger->accounts()->forCustody($repId);
        $opening = $this->accountBalanceBefore($custodyAccountId, $date);

        $receipts = DB::table('receipts')
            ->where('company_id', $companyId)
            ->where('rep_id', $repId)
            ->where('receipt_date', $date)
            ->where('status', 'posted')
            ->selectRaw("
                COALESCE(SUM(CASE WHEN method = 'cash'   AND destination = 'custody' THEN amount ELSE 0 END), 0) AS cash,
                COALESCE(SUM(CASE WHEN method = 'cheque' THEN amount ELSE 0 END), 0) AS cheques,
                COALESCE(SUM(CASE WHEN method = 'bank'   THEN amount ELSE 0 END), 0) AS bank
            ")
            ->first();

        $custodyIn = DB::table('custody_handovers')
            ->where('company_id', $companyId)
            ->where('to_user_id', $repId)
            ->where('handover_date', $date)
            ->where('status', 'approved')
            ->sum('cash_amount');

        $deposits = DB::table('cash_transfers')
            ->where('company_id', $companyId)
            ->where('from_kind', 'custody')
            ->where('from_id', $repId)
            ->where('transfer_date', $date)
            ->where('status', 'posted')
            ->sum('amount');

        $expenses = DB::table('expenses')
            ->where('company_id', $companyId)
            ->where('paid_from_kind', 'custody')
            ->where('paid_from_id', $repId)
            ->where('expense_date', $date)
            ->where('status', 'posted')
            ->sum('amount');

        $refunds = DB::table('sales_returns')
            ->where('company_id', $companyId)
            ->where('rep_id', $repId)
            ->where('return_date', $date)
            ->where('status', 'posted')
            ->where('refund_method', 'cash')
            ->sum('total');

        // The cash equation, written exactly as documented.
        $expected = Num::money(
            Num::sub(
                Num::add(Num::add($opening, $receipts->cash, Num::MONEY_SCALE), $custodyIn, Num::MONEY_SCALE),
                Num::add(Num::add($deposits, $expenses, Num::MONEY_SCALE), $refunds, Num::MONEY_SCALE),
                Num::MONEY_SCALE
            )
        );

        $closing->forceFill([
            'cash_opening' => Num::money($opening),
            'cash_receipts' => Num::money($receipts->cash),
            'cash_custody_in' => Num::money($custodyIn),
            'cash_deposits' => Num::money($deposits),
            'cash_expenses' => Num::money($expenses),
            'cash_refunds' => Num::money($refunds),
            'expected_cash' => $expected,
            // Non-cash collections are reported, never added to cash on hand.
            'cheque_collections' => Num::money($receipts->cheques),
            'bank_collections' => Num::money($receipts->bank),
        ])->save();
    }

    protected function computeActivity(DayClosing $closing): void
    {
        $date = $closing->business_date->toDateString();

        $sales = DB::table('sales_invoices')
            ->where('company_id', $closing->company_id)
            ->where('rep_id', $closing->rep_id)
            ->where('invoice_date', $date)
            ->where('status', 'posted')
            ->sum('total');

        $returns = DB::table('sales_returns')
            ->where('company_id', $closing->company_id)
            ->where('rep_id', $closing->rep_id)
            ->where('return_date', $date)
            ->where('status', 'posted')
            ->sum('total');

        $planned = DB::table('visit_plan_lines as vpl')
            ->join('visit_plans as vp', 'vp.id', '=', 'vpl.visit_plan_id')
            ->where('vp.company_id', $closing->company_id)
            ->where('vp.rep_id', $closing->rep_id)
            ->where('vp.plan_date', $date)
            ->count();

        $visits = DB::table('visits')
            ->where('company_id', $closing->company_id)
            ->where('rep_id', $closing->rep_id)
            ->where('business_date', $date)
            ->selectRaw('COUNT(*) AS done, COUNT(*) FILTER (WHERE is_productive) AS productive')
            ->first();

        $closing->forceFill([
            'sales_total' => Num::money($sales),
            'returns_total' => Num::money($returns),
            'visits_planned' => $planned,
            'visits_done' => (int) $visits->done,
            'visits_productive' => (int) $visits->productive,
        ])->save();
    }

    protected function computeSyncState(DayClosing $closing): void
    {
        $pending = DB::table('sync_operations')
            ->where('company_id', $closing->company_id)
            ->where('user_id', $closing->rep_id)
            ->whereIn('status', ['pending', 'conflict'])
            ->whereDate('client_created_at', $closing->business_date->toDateString())
            ->count();

        $closing->forceFill([
            'pending_sync_ops' => $pending,
            'sync_complete' => $pending === 0,
        ])->save();
    }

    /**
     * The rep submits their counted stock and counted cash.
     *
     * Counts arrive keyed by the line ids the client was shown, but submit()
     * recomputes first — a late-syncing sale must be reflected before the
     * variance is struck — and recomputing rebuilds the stock lines with new
     * ids. So the incoming line ids are resolved to (item, batch) BEFORE the
     * recompute and re-matched after it. Callers may also key a count by
     * item_id directly.
     *
     * @param  array<int, array{line_id?: int, item_id?: int, batch_id?: int|null, counted_qty: string}>  $countedStock
     */
    public function submit(DayClosing $closing, string $actualCash, array $countedStock = []): DayClosing
    {
        return DB::transaction(function () use ($closing, $actualCash, $countedStock) {
            $closing = DayClosing::with('stockLines')->lockForUpdate()->findOrFail($closing->id);

            if ($closing->isFinal()) {
                throw DomainException::make('field.day_closed',
                    'اليوم معتمد بالفعل.', ['status' => $closing->status]);
            }

            // Translate line ids to their item/batch identity while they still exist.
            $existing = $closing->stockLines->keyBy('id');
            $counts = [];

            foreach ($countedStock as $input) {
                if (isset($input['line_id']) && $existing->has($input['line_id'])) {
                    $line = $existing->get($input['line_id']);
                    $itemId = $line->item_id;
                    $batchId = $line->batch_id;
                } elseif (isset($input['item_id'])) {
                    $itemId = $input['item_id'];
                    $batchId = $input['batch_id'] ?? null;
                } else {
                    continue;
                }

                $counts[$itemId.':'.($batchId ?? 0)] = $input['counted_qty'];
            }

            $this->compute($closing);
            $closing->refresh()->load('stockLines');

            $varianceValue = '0';

            foreach ($closing->stockLines as $line) {
                $key = $line->item_id.':'.($line->batch_id ?? 0);

                if (! array_key_exists($key, $counts)) {
                    continue;
                }

                $counted = Num::qty($counts[$key]);
                $variance = Num::qty(Num::sub($counted, $line->expected_qty, Num::QTY_SCALE));

                $line->forceFill([
                    'counted_qty' => $counted,
                    'variance_qty' => $variance,
                ])->save();

                $varianceValue = Num::add($varianceValue,
                    Num::mul($variance, $line->unit_cost), Num::MONEY_SCALE);
            }

            $actualCash = Num::money($actualCash);

            $closing->forceFill([
                'actual_cash' => $actualCash,
                'cash_variance' => Num::money(
                    Num::sub($actualCash, $closing->expected_cash, Num::MONEY_SCALE)
                ),
                'stock_variance_value' => Num::money($varianceValue),
                'status' => 'submitted',
                'submitted_at' => now(),
            ])->save();

            return $closing->fresh(['stockLines']);
        });
    }

    /**
     * A supervisor approves the close.
     *
     * Refused while operations are unsynced unless an override with a reason is
     * recorded, because approving a partial picture is how variances get buried.
     * A stock variance becomes a real, approved adjustment document — never a
     * silent write-off, and never a deduction from anybody's salary.
     */
    public function approve(DayClosing $closing, array $options = []): DayClosing
    {
        return DB::transaction(function () use ($closing, $options) {
            $closing = DayClosing::with('stockLines')->lockForUpdate()->findOrFail($closing->id);

            if ($closing->status === 'approved') {
                return $closing;
            }
            if ($closing->status !== 'submitted' && $closing->status !== 'reopened') {
                throw DomainException::make('field.day_not_submitted',
                    'لا يمكن اعتماد يوم لم يتم تسليمه من المندوب.', ['status' => $closing->status]);
            }

            $this->computeSyncState($closing);
            $closing->refresh();

            if (! $closing->sync_complete) {
                if (empty($options['sync_override_reason'])) {
                    throw DomainException::make('field.sync_incomplete', sprintf(
                        'لا يمكن الإقفال النهائي قبل اكتمال مزامنة %d عملية. يلزم استثناء موثق من مسؤول مختص.',
                        $closing->pending_sync_ops
                    ), ['pending_sync_ops' => $closing->pending_sync_ops]);
                }

                $closing->forceFill([
                    'sync_override_by' => auth()->id(),
                    'sync_override_reason' => $options['sync_override_reason'],
                ])->save();
            }

            $adjustmentId = null;
            $hasStockVariance = $closing->stockLines->contains(
                fn ($l) => ! Num::isZero($l->variance_qty, Num::QTY_SCALE)
            );

            if ($hasStockVariance) {
                $adjustmentId = $this->createVarianceAdjustment($closing)->id;
            }

            $closing->forceFill([
                'status' => 'approved',
                'approved_by' => auth()->id(),
                'approved_at' => now(),
                'variance_adjustment_id' => $adjustmentId,
                'notes' => trim(($closing->notes ?? "\n").($options['notes'] ?? '')),
            ])->save();

            return $closing->fresh(['stockLines']);
        });
    }

    /**
     * Turn counted differences into a stock adjustment awaiting its own approval.
     *
     * It is created as pending, not posted: a variance needs a written record
     * and a decision, and this document is where both live.
     */
    protected function createVarianceAdjustment(DayClosing $closing): StockAdjustment
    {
        $adjustment = StockAdjustment::create([
            'company_id' => $closing->company_id,
            'warehouse_id' => $closing->van_warehouse_id,
            'code' => $this->numbering->next('stock_adjustment'),
            'adjustment_date' => $closing->business_date->toDateString(),
            'reason' => 'count_variance',
            'status' => 'pending_approval',
            'created_by' => auth()->id(),
            'notes' => "فروق إقفال يوم المندوب {$closing->code} — تحتاج محضرًا واعتمادًا",
        ]);

        $total = '0';

        foreach ($closing->stockLines as $line) {
            if (Num::isZero($line->variance_qty, Num::QTY_SCALE)) {
                continue;
            }

            $value = Num::round(Num::mul($line->variance_qty, $line->unit_cost), 4);

            StockAdjustmentLine::create([
                'stock_adjustment_id' => $adjustment->id,
                'item_id' => $line->item_id,
                'batch_id' => $line->batch_id,
                'qty_base' => $line->variance_qty,   // signed
                'unit_cost' => $line->unit_cost,
                'value' => $value,
            ]);

            $total = Num::add($total, $value, Num::MONEY_SCALE);
        }

        $adjustment->forceFill(['total_value' => Num::money($total)])->save();

        return $adjustment;
    }

    /** Reopening an approved day needs a permission, a reason and a trail. */
    public function reopen(DayClosing $closing, string $reason): DayClosing
    {
        if (trim($reason) === '') {
            throw DomainException::make('field.reopen_reason_required',
                'يجب تسجيل سبب إعادة فتح اليوم.', ['closing_id' => $closing->id]);
        }

        return DB::transaction(function () use ($closing, $reason) {
            $closing->forceFill([
                'status' => 'reopened',
                'reopened_by' => auth()->id(),
                'reopened_at' => now(),
                'reopen_reason' => $reason,
            ])->save();

            return $closing;
        });
    }

    protected function accountBalanceBefore(int $accountId, string $date): string
    {
        $row = DB::table('journal_lines as jl')
            ->join('journal_entries as je', 'je.id', '=', 'jl.journal_entry_id')
            ->where('jl.account_id', $accountId)
            ->where('je.status', 'posted')
            ->where('je.entry_date', '<', $date)
            ->selectRaw('COALESCE(SUM(jl.debit), 0) AS d, COALESCE(SUM(jl.credit), 0) AS c')
            ->first();

        return Num::money(Num::sub($row->d, $row->c, Num::MONEY_SCALE));
    }
}
