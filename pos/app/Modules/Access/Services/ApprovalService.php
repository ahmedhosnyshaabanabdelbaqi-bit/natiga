<?php

declare(strict_types=1);

namespace App\Modules\Access\Services;

use App\Models\User;
use App\Modules\Access\Models\Approval;
use App\Modules\Core\Services\PosContext;
use App\Support\Exceptions\ApprovalRequiredException;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Manager authorisation for one specific action, on one document, up to one
 * amount. There is no shared "manager code": the approving manager signs in with
 * their own credentials, and the approval is recorded against their user id.
 *
 * An approval is single-use: `consume()` marks it so the same token cannot
 * authorise a second discount.
 */
class ApprovalService
{
    public function __construct(
        private readonly PermissionService $permissions,
        private readonly AuditService $audit,
        private readonly PosContext $context,
    ) {}

    /**
     * Request an approval token. Returns the pending approval; the manager then
     * calls `approve()` with their own credentials.
     *
     * @param  array<string,mixed>  $payload
     */
    public function request(string $action, Money $amount, array $payload = [], ?string $reason = null): Approval
    {
        return Approval::query()->create([
            'uuid' => (string) Str::uuid7(),
            'action' => $action,
            'amount' => $amount->toString(4),
            'payload' => $payload,
            'status' => 'pending',
            'requested_by' => $this->context->userId(),
            'branch_id' => $this->context->branchId(),
            'terminal_id' => $this->context->terminalId(),
            'reason' => $reason,
            'expires_at' => Carbon::now()->addMinutes(15),
        ]);
    }

    /** The manager approves with their own identity and their own permission. */
    public function approve(Approval $approval, User $manager, string $requiredPermission): Approval
    {
        if ($approval->status !== 'pending') {
            throw new InvalidOperationException('طلب الموافقة لم يعد صالحًا.', 'approval_not_pending');
        }

        if ($approval->expires_at && $approval->expires_at->isPast()) {
            $approval->update(['status' => 'expired']);
            throw new InvalidOperationException('انتهت صلاحية طلب الموافقة.', 'approval_expired');
        }

        if ($manager->id === $approval->requested_by) {
            throw new InvalidOperationException('لا يمكن اعتماد طلبك بنفسك.', 'approval_self');
        }

        $this->permissions->authorize($manager, $requiredPermission, $approval->branch_id);

        $approval->update([
            'status' => 'approved',
            'approved_by' => $manager->id,
            'approved_at' => now(),
        ]);

        $this->audit->log('approval.granted', $approval, null, [
            'action' => $approval->action,
            'amount' => $approval->amount,
            'approved_by' => $manager->id,
        ]);

        return $approval->refresh();
    }

    /**
     * Validate and burn an approval for a concrete action/amount. Throws if the
     * token does not match what is actually being done.
     */
    public function consume(?string $uuid, string $action, Money $amount): ?Approval
    {
        if (! $uuid) {
            return null;
        }

        return DB::transaction(function () use ($uuid, $action, $amount): Approval {
            $approval = Approval::query()->where('uuid', $uuid)->lockForUpdate()->first();

            if (! $approval) {
                throw new InvalidOperationException('رمز الموافقة غير معروف.', 'approval_unknown');
            }
            if ($approval->status !== 'approved') {
                throw new InvalidOperationException('رمز الموافقة غير معتمد أو سبق استخدامه.', 'approval_not_usable');
            }
            if ($approval->action !== $action) {
                throw new InvalidOperationException('رمز الموافقة صادر لعملية مختلفة.', 'approval_action_mismatch', 422, [
                    'expected' => $action, 'actual' => $approval->action,
                ]);
            }
            // The approved ceiling must cover what is actually being done.
            if (Money::of($approval->amount)->isLessThan($amount)) {
                throw new InvalidOperationException('المبلغ يتجاوز القيمة المعتمدة.', 'approval_amount_exceeded', 422, [
                    'approved' => $approval->amount, 'requested' => $amount->toString(),
                ]);
            }

            $approval->update(['status' => 'consumed', 'consumed_at' => now()]);

            return $approval;
        });
    }

    /**
     * Decide whether an action needs a manager: the cashier's own ceiling is
     * checked first, and only an excess demands an approval token.
     */
    public function requireApprovalIfOverLimit(
        User $user,
        string $action,
        Money $amount,
        Money $limit,
        ?string $approvalUuid,
    ): ?Approval {
        if (! $amount->isGreaterThan($limit)) {
            return null;
        }

        if (! $approvalUuid) {
            throw new ApprovalRequiredException(
                'تتطلب هذه العملية موافقة المدير.',
                'approval_required',
                422,
                ['action' => $action, 'amount' => $amount->toString(), 'limit' => $limit->toString()],
            );
        }

        return $this->consume($approvalUuid, $action, $amount);
    }
}
