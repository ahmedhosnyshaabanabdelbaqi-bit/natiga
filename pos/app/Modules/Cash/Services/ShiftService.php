<?php

declare(strict_types=1);

namespace App\Modules\Cash\Services;

use App\Models\User;
use App\Modules\Access\Services\AuditService;
use App\Modules\Cash\Models\CashAccount;
use App\Modules\Cash\Models\Shift;
use App\Modules\Core\Models\Terminal;
use App\Modules\Core\Services\BusinessCalendar;
use App\Modules\Core\Services\SequenceService;
use App\Modules\Sales\Models\Sale;
use App\Modules\Sales\Models\SalePayment;
use App\Modules\Sales\Models\SaleReturn;
use App\Modules\Sync\Models\OfflineOperation;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use Illuminate\Support\Facades\DB;

/**
 * Shift (till session) lifecycle.
 *
 * A shift owns one cash drawer for one terminal. The database enforces that a
 * drawer and a terminal can each have only one open shift, so two cashiers can
 * never run overlapping sessions on the same till and make its expected cash
 * meaningless.
 */
class ShiftService
{
    public function __construct(
        private readonly CashService $cash,
        private readonly SequenceService $sequences,
        private readonly BusinessCalendar $calendar,
        private readonly AuditService $audit,
    ) {}

    public function open(Terminal $terminal, User $user, Money $openingFloat, bool $blindCount = true): Shift
    {
        return DB::transaction(function () use ($terminal, $user, $openingFloat, $blindCount): Shift {
            $account = $this->cash->drawerForTerminal($terminal->id, (int) $terminal->branch_id);

            $existing = Shift::query()
                ->where('terminal_id', $terminal->id)
                ->whereIn('status', ['open', 'closing'])
                ->first();

            if ($existing) {
                throw new InvalidOperationException(
                    'توجد وردية مفتوحة بالفعل على هذا الكاشير.',
                    'shift_already_open',
                    409,
                    ['shift_id' => $existing->id, 'user_id' => $existing->user_id],
                );
            }

            $shift = Shift::query()->create([
                'number' => $this->sequences->next('shift', $terminal->code),
                'branch_id' => $terminal->branch_id,
                'terminal_id' => $terminal->id,
                'cash_account_id' => $account->id,
                'user_id' => $user->id,
                'opening_float' => $openingFloat->toString(4),
                'blind_count' => $blindCount,
                'status' => 'open',
                'opened_at' => now(),
            ]);

            if ($openingFloat->isPositive()) {
                $this->cash->record($account, $shift, CashService::TYPE_OPENING_FLOAT, $openingFloat, $shift, 'عهدة افتتاحية');
            }

            $this->audit->log('shift.opened', $shift, null, [
                'opening_float' => $openingFloat->toString(),
                'terminal' => $terminal->code,
            ]);

            return $shift;
        });
    }

    /**
     * Close a shift.
     *
     * With blind counting the cashier never sees the expected figure before
     * entering the counted cash — the variance is computed afterwards.
     *
     * A terminal that still holds unsynced offline operations cannot close
     * normally: `$allowUnsynced` (a manager path) records how many were pending
     * so the variance is explainable rather than silently wrong.
     *
     * @param  array<string,int>|null  $denominations  e.g. {"200": 3, "100": 7}
     */
    public function close(
        Shift $shift,
        User $closedBy,
        Money $countedCash,
        ?array $denominations = null,
        ?string $notes = null,
        bool $allowUnsynced = false,
    ): Shift {
        return DB::transaction(function () use ($shift, $closedBy, $countedCash, $denominations, $notes, $allowUnsynced): Shift {
            $shift = Shift::query()->whereKey($shift->id)->lockForUpdate()->firstOrFail();

            if ($shift->status === 'closed' || $shift->status === 'reconciled') {
                throw new InvalidOperationException('الوردية مغلقة بالفعل.', 'shift_already_closed', 409);
            }

            $pending = OfflineOperation::query()
                ->where('terminal_id', $shift->terminal_id)
                ->whereIn('status', ['pending', 'conflict'])
                ->count();

            if ($pending > 0 && ! $allowUnsynced) {
                throw new InvalidOperationException(
                    'لا يمكن الإغلاق النهائي مع وجود عمليات غير متزامنة. يلزم مسار تسوية باعتماد المدير.',
                    'unsynced_operations_pending',
                    409,
                    ['pending' => $pending],
                );
            }

            $expected = $this->cash->expectedCash($shift);
            $variance = $countedCash->minus($expected)->quantize();

            $totals = $this->closeOutTotals($shift, $expected, $countedCash, $variance);

            $shift->forceFill([
                'status' => 'closed',
                'expected_cash' => $expected->toString(4),
                'counted_cash' => $countedCash->toString(4),
                'variance' => $variance->toString(4),
                'denominations' => $denominations,
                'closing_notes' => $notes,
                'closed_by' => $closedBy->id,
                'closed_at' => now(),
                'unsynced_operations_at_close' => $pending,
                'totals' => $totals,
            ])->save();

            $this->audit->log('shift.closed', $shift, null, [
                'expected' => $expected->toString(),
                'counted' => $countedCash->toString(),
                'variance' => $variance->toString(),
                'unsynced_operations' => $pending,
            ], $notes);

            return $shift->refresh();
        });
    }

    /**
     * Post-close correction. A closed shift is never edited silently: the
     * adjustment is a recorded cash movement plus an audit entry naming the
     * approver.
     */
    public function reconcile(Shift $shift, User $approver, Money $adjustment, string $reason): Shift
    {
        return DB::transaction(function () use ($shift, $approver, $adjustment, $reason): Shift {
            if ($shift->status !== 'closed') {
                throw new InvalidOperationException('لا يمكن تسوية وردية غير مغلقة.', 'shift_not_closed');
            }

            $account = CashAccount::query()->findOrFail($shift->cash_account_id);
            $this->cash->record($account, $shift, CashService::TYPE_ADJUSTMENT, $adjustment, $shift, $reason);

            $before = ['variance' => $shift->variance, 'status' => $shift->status];

            $shift->forceFill([
                'status' => 'reconciled',
                'approved_by' => $approver->id,
                'closing_notes' => trim((string) $shift->closing_notes."\n".$reason),
            ])->save();

            $this->audit->log('shift.reconciled', $shift, $before, [
                'adjustment' => $adjustment->toString(),
                'approved_by' => $approver->id,
            ], $reason);

            return $shift->refresh();
        });
    }

    /** @return array<string,mixed> */
    public function closeOutTotals(Shift $shift, ?Money $expected = null, ?Money $counted = null, ?Money $variance = null): array
    {
        $expected ??= $this->cash->expectedCash($shift);

        $salesAgg = Sale::query()
            ->where('shift_id', $shift->id)
            ->where('status', Sale::STATUS_COMPLETED)
            ->selectRaw('COUNT(*) AS cnt, COALESCE(SUM(grand_total),0) AS total, COALESCE(SUM(discount_total),0) AS discounts, COALESCE(SUM(tax_total),0) AS taxes, COALESCE(SUM(due_total),0) AS credit')
            ->first();

        $returnsAgg = SaleReturn::query()
            ->where('shift_id', $shift->id)
            ->selectRaw('COUNT(*) AS cnt, COALESCE(SUM(grand_total),0) AS total, COALESCE(SUM(refund_cash),0) AS cash_refund')
            ->first();

        $byMethod = SalePayment::query()
            ->join('sales', 'sales.id', '=', 'sale_payments.sale_id')
            ->where('sales.shift_id', $shift->id)
            ->where('sales.status', Sale::STATUS_COMPLETED)
            ->selectRaw('sale_payments.method_code, SUM(sale_payments.amount) AS total, COUNT(*) AS cnt')
            ->groupBy('sale_payments.method_code')
            ->get()
            ->mapWithKeys(fn ($r) => [$r->method_code => [
                'total' => Money::of((string) $r->total)->toString(),
                'count' => (int) $r->cnt,
            ]])->all();

        return [
            'sales_count' => (int) ($salesAgg->cnt ?? 0),
            'sales_total' => Money::of((string) ($salesAgg->total ?? '0'))->toString(),
            'discounts_total' => Money::of((string) ($salesAgg->discounts ?? '0'))->toString(),
            'tax_total' => Money::of((string) ($salesAgg->taxes ?? '0'))->toString(),
            'credit_total' => Money::of((string) ($salesAgg->credit ?? '0'))->toString(),
            'returns_count' => (int) ($returnsAgg->cnt ?? 0),
            'returns_total' => Money::of((string) ($returnsAgg->total ?? '0'))->toString(),
            'returns_cash' => Money::of((string) ($returnsAgg->cash_refund ?? '0'))->toString(),
            'payments_by_method' => $byMethod,
            'cash_breakdown' => $this->cash->breakdown($shift),
            'opening_float' => Money::of($shift->opening_float)->toString(),
            'expected_cash' => $expected->toString(),
            'counted_cash' => $counted?->toString(),
            'variance' => $variance?->toString(),
            'business_date' => $this->calendar->businessDate($shift->opened_at),
        ];
    }
}
