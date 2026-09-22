<?php

namespace App\Modules\System\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Auth\Services\SessionManager;
use App\Modules\System\Services\UserAccessRules;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

/**
 * "Reset access": revoke every session, e-mail a password reset link and (optionally, with a reason)
 * clear TOTP MFA so the user can enrol again. Used when a device is lost or an account is suspected compromised.
 */
final class ResetUserAccess
{
    public function __construct(private readonly AuditService $audit, private readonly UserAccessRules $rules, private readonly SessionManager $sessions) {}

    /** @return array{sessions_revoked: int, reset_link_sent: bool, mfa_reset: bool} */
    public function execute(User $target, User $actor, bool $resetMfa, ?string $reason = null): array
    {
        $this->rules->assertCanManage($actor, $target, 'access_reset_blocked');

        $result = DB::transaction(function () use ($target, $actor, $resetMfa, $reason) {
            $target = User::query()->whereKey($target->id)->lockForUpdate()->firstOrFail();
            $revoked = $this->sessions->logoutAll($target);
            $target->forceFill(['remember_token' => Str::random(60)])->save();
            $tokens = $target->tokens()->delete();
            $mfaReset = false;
            if ($resetMfa && ($target->two_factor_secret !== null || $target->two_factor_confirmed_at !== null)) {
                $target->forceFill(['two_factor_secret' => null, 'two_factor_recovery_codes' => null, 'two_factor_confirmed_at' => null])->save();
                $mfaReset = true;
                SecurityEvents::record($target, 'mfa_reset_by_admin', ['by' => $actor->id, 'reason' => $reason], 'critical');
            }
            $this->audit->log('users.access_reset', $target, new: ['sessions_revoked' => $revoked, 'api_tokens_revoked' => $tokens, 'mfa_reset' => $mfaReset], reason: $reason, actor: $actor);
            SecurityEvents::record($target, 'sessions_revoked_by_admin', ['by' => $actor->id, 'count' => $revoked], 'warning');

            return ['sessions_revoked' => $revoked, 'mfa_reset' => $mfaReset];
        });

        $status = Password::broker()->sendResetLink(['email' => $target->email]);

        return $result + ['reset_link_sent' => $status === Password::RESET_LINK_SENT];
    }
}
