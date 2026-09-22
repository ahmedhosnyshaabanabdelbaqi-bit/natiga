<?php

declare(strict_types=1);

namespace App\Modules\Cash\Services;

use App\Modules\Cash\Models\CashAccount;
use App\Modules\Cash\Models\CashMovement;
use App\Modules\Cash\Models\Shift;
use App\Modules\Core\Services\PosContext;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Cash drawer ledger.
 *
 * Every pound entering or leaving a drawer is one signed row. The expected cash
 * at close is therefore a pure sum, and the same receipt can never be counted
 * twice (a cash sale writes `sale_cash`; a later collection on a credit invoice
 * writes `collection` — different documents, different rows).
 */
class CashService
{
    // Money in
    public const TYPE_OPENING_FLOAT = 'opening_float';

    public const TYPE_SALE_CASH = 'sale_cash';

    public const TYPE_COLLECTION = 'collection';

    public const TYPE_DEPOSIT = 'deposit';

    public const TYPE_TRANSFER_IN = 'transfer_in';

    // Money out
    public const TYPE_CHANGE_OUT = 'change_out';

    public const TYPE_REFUND = 'refund';

    public const TYPE_EXPENSE = 'expense';

    public const TYPE_WITHDRAWAL = 'withdrawal';

    public const TYPE_TRANSFER_OUT = 'transfer_out';

    public const TYPE_ADJUSTMENT = 'adjustment';

    public function __construct(private readonly PosContext $context) {}

    /**
     * @param  Money  $amount  signed: positive into the drawer, negative out
     */
    public function record(
        CashAccount $account,
        ?Shift $shift,
        string $type,
        Money $amount,
        ?Model $source = null,
        ?string $reason = null,
        ?int $approvalId = null,
    ): CashMovement {
        if ($amount->isZero()) {
            throw new InvalidOperationException('لا يمكن تسجيل حركة نقدية بقيمة صفر.', 'zero_cash_movement');
        }

        $movement = CashMovement::query()->create([
            'cash_account_id' => $account->id,
            'shift_id' => $shift?->id,
            'branch_id' => $account->branch_id ?? $this->context->branchId(),
            'type' => $type,
            'amount' => $amount->toString(4),
            'source_type' => $source ? $source::class : null,
            'source_id' => $source?->getKey(),
            'user_id' => $this->context->userId(),
            'approval_id' => $approvalId,
            'reason' => $reason,
            'occurred_at' => now(),
        ]);

        // Atomic conditional update: no read-modify-write race on the balance.
        DB::update(
            'UPDATE cash_accounts SET balance = balance + ?, updated_at = now() WHERE id = ?',
            [$amount->toString(4), $account->id],
        );

        return $movement;
    }

    /**
     * Expected cash in the drawer for a shift:
     *   opening float
     * + cash taken on sales, net of change handed back
     * + collections and deposits
     * - cash refunds, expenses and withdrawals
     *
     * Implemented as the signed sum of the shift's movements, which is the same
     * formula and cannot drift from it.
     */
    public function expectedCash(Shift $shift): Money
    {
        $sum = CashMovement::query()->where('shift_id', $shift->id)->sum('amount');

        return Money::of((string) $sum)->quantize();
    }

    /** @return array<string,string> totals per movement type, for the close-out report */
    public function breakdown(Shift $shift): array
    {
        $rows = CashMovement::query()
            ->where('shift_id', $shift->id)
            ->selectRaw('type, SUM(amount) AS total')
            ->groupBy('type')
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $out[$row->type] = Money::of((string) $row->total)->toString();
        }

        return $out;
    }

    public function drawerForTerminal(int $terminalId, int $branchId): CashAccount
    {
        $account = CashAccount::query()
            ->where('terminal_id', $terminalId)
            ->where('is_active', true)
            ->first();

        return $account ?? CashAccount::query()
            ->where('branch_id', $branchId)
            ->where('type', 'drawer')
            ->where('is_active', true)
            ->firstOrFail();
    }
}
