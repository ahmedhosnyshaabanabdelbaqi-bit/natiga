<?php

namespace App\Modules\Members\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Auth\Services\SessionManager;
use Illuminate\Support\Facades\DB;

/**
 * Member-initiated deactivation. The account is disabled (login blocked), every session is
 * invalidated and the membership/financial rows stay intact. Only staff can re-enable the account.
 */
final class DeactivateOwnAccount
{
    public function __construct(private AuditService $audit, private SessionManager $sessions) {}

    public function execute(User $user, ?string $reason = null): User
    {
        return DB::transaction(function () use ($user, $reason) {
            /** @var User $locked */
            $locked = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            if (! $locked->isActive()) {
                return $locked;
            }
            $locked->forceFill(['status' => User::STATUS_DISABLED, 'disabled_at' => now(), 'disabled_by' => $locked->id, 'remember_token' => null])->save();
            $locked->tokens()->delete();

            $this->audit->log('members.self_deactivated', $locked->membership ?? $locked, old: ['status' => User::STATUS_ACTIVE], new: ['status' => User::STATUS_DISABLED], reason: $reason, actor: $locked);
            SecurityEvents::record($locked, 'account_disabled', ['self' => true]);
            $this->sessions->logoutAll($locked);

            return $locked;
        });
    }
}
