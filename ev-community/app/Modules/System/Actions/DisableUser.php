<?php

namespace App\Modules\System\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Auth\Services\SessionManager;
use App\Modules\System\Services\UserAccessRules;
use App\Support\Exceptions\DomainException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Disables an account: status=disabled, all sessions and API tokens invalidated, remember-me token rotated,
 * audit + critical security event.
 * The last active owner can never be disabled.
 */
final class DisableUser
{
    public function __construct(private readonly AuditService $audit, private readonly UserAccessRules $rules, private readonly SessionManager $sessions) {}

    public function execute(User $target, User $actor, string $reason): User
    {
        $this->rules->assertCanManage($actor, $target, 'account_disable_blocked');

        return DB::transaction(function () use ($target, $actor, $reason) {
            $target = User::query()->whereKey($target->id)->lockForUpdate()->firstOrFail();
            if ($target->status === User::STATUS_DISABLED) {
                return $target;
            }
            if ($target->hasRole('owner') && User::query()->role('owner')->where('status', User::STATUS_ACTIVE)->whereKeyNot($target->id)->doesntExist()) {
                throw DomainException::forbidden('users.errors.last_owner');
            }

            // Kill every way back in: status, "remember me" cookies (token rotation), web sessions and API tokens.
            $target->forceFill(['status' => User::STATUS_DISABLED, 'disabled_at' => now(), 'disabled_by' => $actor->id, 'remember_token' => Str::random(60)])->save();
            $revoked = $this->sessions->logoutAll($target);
            $tokens = $target->tokens()->delete();

            $this->audit->log('users.disabled', $target, old: ['status' => User::STATUS_ACTIVE], new: ['status' => User::STATUS_DISABLED, 'sessions_revoked' => $revoked, 'api_tokens_revoked' => $tokens], reason: $reason, actor: $actor);
            SecurityEvents::record($target, 'account_disabled', ['by' => $actor->id, 'reason' => $reason, 'sessions_revoked' => $revoked]);

            return $target;
        });
    }
}
