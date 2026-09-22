<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Modules\Access\Services\AuditService;
use App\Modules\Accounting\Services\PostingService;
use App\Modules\Cash\Models\CashAccount;
use App\Modules\Cash\Models\DrawerOpening;
use App\Modules\Cash\Models\Expense;
use App\Modules\Cash\Models\ExpenseCategory;
use App\Modules\Cash\Services\CashService;
use App\Modules\Core\Services\BusinessCalendar;
use App\Modules\Core\Services\PosContext;
use App\Modules\Core\Services\SequenceService;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class CashController extends Controller
{
    public function __construct(
        private readonly CashService $cash,
        private readonly PostingService $posting,
        private readonly SequenceService $sequences,
        private readonly BusinessCalendar $calendar,
        private readonly AuditService $audit,
        private readonly PosContext $context,
    ) {}

    /** Deposits, withdrawals and transfers between drawer and safe. */
    public function movement(Request $request): JsonResponse
    {
        $data = $request->validate([
            'cash_account_id' => ['required', 'integer', 'exists:cash_accounts,id'],
            'type' => ['required', 'in:deposit,withdrawal,transfer_in,transfer_out,adjustment'],
            'amount' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $account = CashAccount::query()->findOrFail($data['cash_account_id']);
        $amount = Money::of($data['amount']);

        // Outbound types are stored negative; the sign is never the caller's choice.
        $signed = in_array($data['type'], ['withdrawal', 'transfer_out'], true) ? $amount->negated() : $amount;

        $movement = $this->cash->record(
            $account,
            $this->context->shift(),
            $data['type'],
            $signed,
            null,
            $data['reason'],
        );

        $this->audit->log('cash.movement', $movement, null, [
            'type' => $data['type'],
            'amount' => $signed->toString(),
            'account' => $account->code,
        ], $data['reason']);

        return response()->json(['movement' => $movement], 201);
    }

    public function expense(Request $request): JsonResponse
    {
        $data = $request->validate([
            'expense_category_id' => ['required', 'integer', 'exists:expense_categories,id'],
            'cash_account_id' => ['required', 'integer', 'exists:cash_accounts,id'],
            'amount' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'description' => ['nullable', 'string', 'max:500'],
            'spent_on' => ['nullable', 'date'],
        ]);

        $expense = DB::transaction(function () use ($data): Expense {
            $account = CashAccount::query()->findOrFail($data['cash_account_id']);
            $amount = Money::of($data['amount']);
            $shift = $this->context->shift();

            $expense = Expense::query()->create([
                'number' => $this->sequences->next('expense'),
                'branch_id' => $this->context->branchId(),
                'shift_id' => $shift?->id,
                'expense_category_id' => $data['expense_category_id'],
                'cash_account_id' => $account->id,
                'amount' => $amount->toString(4),
                'spent_on' => $data['spent_on'] ?? $this->calendar->businessDate(),
                'description' => $data['description'] ?? null,
                'user_id' => $this->context->userId(),
            ]);

            $this->cash->record($account, $shift, CashService::TYPE_EXPENSE, $amount->negated(), $expense, $data['description'] ?? null);

            $this->posting->post('expense', $expense, [
                ['account' => PostingService::EXPENSE, 'debit' => $amount, 'memo' => $data['description'] ?? 'مصروف'],
                ['account' => PostingService::CASH, 'credit' => $amount, 'memo' => 'صرف نقدي'],
            ], 'مصروف '.$expense->number, $expense->spent_on->toDateString());

            $this->audit->log('expense.recorded', $expense, null, ['amount' => $amount->toString()]);

            return $expense;
        });

        return response()->json(['expense' => $expense], 201);
    }

    /** Opening the drawer without a sale is a logged, permissioned event. */
    public function openDrawer(Request $request): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:120']]);

        $shift = $this->context->shift();
        if (! $shift) {
            throw new InvalidOperationException('لا توجد وردية مفتوحة.', 'shift_required', 409);
        }

        $opening = DrawerOpening::query()->create([
            'shift_id' => $shift->id,
            'user_id' => $this->context->userId(),
            'reason' => $data['reason'],
        ]);

        $this->audit->log('drawer.opened', $opening, null, ['reason' => $data['reason']], $data['reason']);

        return response()->json(['drawer_opening' => $opening], 201);
    }

    public function accounts(Request $request): JsonResponse
    {
        return response()->json(
            CashAccount::query()
                ->where('is_active', true)
                ->when($request->attributes->get('pos.branch_id'), fn ($q, $v) => $q->where(fn ($w) => $w->where('branch_id', $v)->orWhereNull('branch_id')))
                ->get()
        );
    }

    public function expenseCategories(): JsonResponse
    {
        return response()->json(ExpenseCategory::query()->where('is_active', true)->get(['id', 'name']));
    }
}
