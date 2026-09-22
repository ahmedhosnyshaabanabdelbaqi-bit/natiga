<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Modules\Access\Models\Approval;
use App\Modules\Access\Services\ApprovalService;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Manager approval flow.
 *
 * The manager authenticates with THEIR OWN credentials at the till; there is no
 * shared manager code, and the approval is recorded against their user id.
 */
class ApprovalController extends Controller
{
    /** Permission required to approve each kind of action. */
    private const REQUIRED_PERMISSION = [
        'sales.discount' => 'sales.discount.override',
        'sales.change_price' => 'sales.change_price',
        'sales.return' => 'sales.return',
        'sales.return.without_invoice' => 'sales.return.without_invoice',
        'sales.void' => 'sales.void',
        'inventory.adjust' => 'inventory.adjust',
        'cash.drawer.open' => 'cash.drawer.open',
        'cash.shift.reconcile' => 'cash.shift.reconcile',
    ];

    public function __construct(private readonly ApprovalService $approvals) {}

    public function request(Request $request): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'string', 'max:60'],
            'amount' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'payload' => ['nullable', 'array'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $approval = $this->approvals->request(
            $data['action'],
            Money::of($data['amount']),
            $data['payload'] ?? [],
            $data['reason'] ?? null,
        );

        return response()->json([
            'uuid' => $approval->uuid,
            'action' => $approval->action,
            'amount' => $approval->amount,
            'expires_at' => $approval->expires_at?->toIso8601String(),
        ], 201);
    }

    public function approve(Request $request, string $uuid): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'max:120'],
            'password' => ['nullable', 'string'],
            'pin' => ['nullable', 'string', 'min:4', 'max:12'],
        ]);

        $approval = Approval::query()->where('uuid', $uuid)->firstOrFail();

        $manager = User::query()->where('username', $data['username'])->where('is_active', true)->first();

        $credentialOk = $manager && (
            (! empty($data['password']) && Hash::check($data['password'], (string) $manager->password))
            || (! empty($data['pin']) && $manager->pin_hash && Hash::check($data['pin'], $manager->pin_hash))
        );

        if (! $credentialOk) {
            throw ValidationException::withMessages(['username' => ['بيانات المدير غير صحيحة.']]);
        }

        $required = self::REQUIRED_PERMISSION[$approval->action] ?? $approval->action;
        $approved = $this->approvals->approve($approval, $manager, $required);

        return response()->json([
            'uuid' => $approved->uuid,
            'status' => $approved->status,
            'approved_by' => ['id' => $manager->id, 'name' => $manager->name],
            'approved_at' => $approved->approved_at?->toIso8601String(),
        ]);
    }
}
