<?php

namespace App\Modules\Members\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Auth\Services\SessionManager;
use App\Modules\Members\Events\MembershipStatusChanged;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Membership;
use App\Modules\Members\Models\MembershipStatusHistory;
use App\Modules\System\Services\Settings;
use App\Support\Exceptions\DomainException;
use Illuminate\Support\Facades\DB;

/**
 * The only way a membership changes status. Validates the state machine, stores history and audit,
 * invalidates sessions on suspension and dispatches the matching event after commit
 * (MembershipApproved / Rejected / Suspended / Reactivated / Expired / Reopened).
 *
 * Idempotent: asking for the current status is a no-op (no history, audit or event). Concurrent
 * requests are serialised by the row lock, so a double click approves exactly once.
 */
final class ChangeMembershipStatus
{
    public function __construct(private AuditService $audit, private SessionManager $sessions) {}

    /**
     * @param  MembershipStatus[]|null  $expectedFrom  when given, the transition is only applied from one of these
     *                                                 statuses (checked under the row lock). Each admin endpoint passes
     *                                                 its own source statuses so that, e.g., `reactivate`
     *                                                 (members.suspend) can never approve a pending membership and
     *                                                 `approve` (members.approve) can never lift a suspension.
     */
    public function execute(Membership $membership, MembershipStatus $to, ?User $actor, ?string $reason = null, ?array $expectedFrom = null): Membership
    {
        $reason = $reason !== null ? trim($reason) : null;
        if ($reason === '') {
            $reason = null;
        }
        if ($to->requiresReason() && mb_strlen((string) $reason) < 5) {
            throw DomainException::because('core.errors.reason_required', field: 'reason');
        }

        return DB::transaction(function () use ($membership, $to, $actor, $reason, $expectedFrom) {
            /** @var Membership $locked */
            $locked = Membership::query()->whereKey($membership->id)->lockForUpdate()->firstOrFail();
            $from = $locked->status;
            if ($from === $to) {
                return $locked; // idempotent
            }
            if (! $from->canTransitionTo($to) || ($expectedFrom !== null && ! in_array($from, $expectedFrom, true))) {
                throw DomainException::because('core.errors.invalid_state_transition', ['from' => $from->label(), 'to' => $to->label()], 'status');
            }

            $locked->forceFill(['status' => $to] + $this->timestampsFor($locked, $from, $to, $actor))->save();

            $history = MembershipStatusHistory::create([
                'membership_id' => $locked->id,
                'from_status' => $from->value,
                'to_status' => $to->value,
                'changed_by' => $actor?->id,
                'reason' => $reason,
                'created_at' => now(),
            ]);

            $this->audit->log('members.status_changed', $locked, old: ['status' => $from->value], new: ['status' => $to->value], reason: $reason, actor: $actor, actorType: $actor ? 'user' : 'system');

            if ($to === MembershipStatus::Suspended) {
                // End every way back in: web sessions, remember-me cookies and API tokens.
                $user = $locked->user;
                $user->forceFill(['remember_token' => null])->save();
                $user->tokens()->delete();
                $ended = $this->sessions->logoutAll($user);
                SecurityEvents::record($user, 'membership_suspended', ['membership_id' => $locked->id, 'by' => $actor?->id, 'sessions_ended' => $ended], 'warning');
            }

            $event = MembershipStatusChanged::classFor($from, $to);
            DB::afterCommit(fn () => event(new $event($locked, $from, $to, $reason, $history->id, $actor?->id)));

            return $locked;
        });
    }

    /** @return array<string, mixed> */
    private function timestampsFor(Membership $membership, MembershipStatus $from, MembershipStatus $to, ?User $actor): array
    {
        return match ($to) {
            MembershipStatus::Active => [
                'approved_at' => $from === MembershipStatus::Pending ? now() : ($membership->approved_at ?? now()),
                'approved_by' => $from === MembershipStatus::Pending ? $actor?->id : $membership->approved_by,
                'suspended_at' => null,
                'expires_at' => $from === MembershipStatus::Suspended && $membership->expires_at?->isFuture()
                    ? $membership->expires_at
                    : now()->addDays(max(30, Settings::int('members.membership_card_validity_days', 365))),
            ],
            MembershipStatus::Suspended => ['suspended_at' => now()],
            MembershipStatus::Expired => ['expires_at' => $membership->expires_at?->isPast() ? $membership->expires_at : now()],
            MembershipStatus::Pending => ['approved_at' => null, 'approved_by' => null, 'suspended_at' => null],
            MembershipStatus::Rejected => [],
        };
    }
}
