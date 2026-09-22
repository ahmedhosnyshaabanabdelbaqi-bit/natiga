<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Modules\Access\Services\PermissionService;
use App\Modules\Cash\Models\Shift;
use App\Modules\Cash\Services\CashService;
use App\Modules\Cash\Services\ShiftService;
use App\Modules\Core\Models\Terminal;
use App\Modules\Core\Services\PosContext;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ShiftController extends Controller
{
    public function __construct(
        private readonly ShiftService $shifts,
        private readonly CashService $cash,
        private readonly PermissionService $permissions,
        private readonly PosContext $context,
    ) {}

    public function current(Request $request): JsonResponse
    {
        $shift = $this->context->shift();

        if (! $shift) {
            return response()->json(['shift' => null]);
        }

        $blind = (bool) $shift->blind_count;
        $canSeeExpected = ! $blind || $this->permissions->userCan($request->user(), 'cash.shift.reconcile', $shift->branch_id);

        return response()->json([
            'shift' => [
                'id' => $shift->id,
                'number' => $shift->number,
                'status' => $shift->status,
                'opened_at' => $shift->opened_at?->toIso8601String(),
                'opening_float' => $shift->opening_float,
                'blind_count' => $blind,
                // Blind counting: the cashier does not see the expected figure
                // before entering what they actually counted.
                'expected_cash' => $canSeeExpected ? $this->cash->expectedCash($shift)->toString() : null,
                'totals' => $this->shifts->closeOutTotals($shift),
            ],
        ]);
    }

    public function open(Request $request): JsonResponse
    {
        $data = $request->validate([
            'terminal_code' => ['nullable', 'string', 'max:32'],
            'opening_float' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'blind_count' => ['boolean'],
        ]);

        $terminal = $this->context->terminal()
            ?? Terminal::query()->where('code', $data['terminal_code'] ?? '')->firstOrFail();

        $shift = $this->shifts->open(
            $terminal,
            $request->user(),
            Money::of($data['opening_float']),
            (bool) ($data['blind_count'] ?? true),
        );

        return response()->json(['shift' => $shift], 201);
    }

    public function close(Request $request, Shift $shift): JsonResponse
    {
        $data = $request->validate([
            'counted_cash' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'denominations' => ['nullable', 'array'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'allow_unsynced' => ['boolean'],
        ]);

        // Closing over unsynced operations is a manager-only exception path.
        $allowUnsynced = (bool) ($data['allow_unsynced'] ?? false);
        if ($allowUnsynced) {
            $this->permissions->authorize($request->user(), 'cash.shift.reconcile', $shift->branch_id);
        }

        $closed = $this->shifts->close(
            $shift,
            $request->user(),
            Money::of($data['counted_cash']),
            $data['denominations'] ?? null,
            $data['notes'] ?? null,
            $allowUnsynced,
        );

        return response()->json([
            'shift' => $closed,
            'report' => $closed->totals,
        ]);
    }

    public function reconcile(Request $request, Shift $shift): JsonResponse
    {
        $data = $request->validate([
            'adjustment' => ['required', 'string', 'regex:/^-?\d+(\.\d{1,4})?$/'],
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $this->permissions->authorize($request->user(), 'cash.shift.reconcile', $shift->branch_id);

        return response()->json([
            'shift' => $this->shifts->reconcile($shift, $request->user(), Money::of($data['adjustment']), $data['reason']),
        ]);
    }

    public function report(Shift $shift): JsonResponse
    {
        return response()->json([
            'shift' => $shift,
            'report' => $shift->totals ?? $this->shifts->closeOutTotals($shift),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $query = Shift::query()
            ->with(['user:id,name', 'terminal:id,code,name'])
            ->when($request->attributes->get('pos.branch_id'), fn ($q, $v) => $q->where('branch_id', $v))
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('from'), fn ($q, $v) => $q->where('opened_at', '>=', $v))
            ->orderByDesc('opened_at');

        return response()->json($query->paginate(min((int) $request->query('per_page', 25), 200)));
    }
}
