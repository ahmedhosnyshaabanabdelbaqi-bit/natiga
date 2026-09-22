<?php

namespace App\Modules\Members\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Auth\Services\SessionManager;
use App\Modules\Members\Events\MemberAnonymized;
use App\Modules\Members\Models\AccountDeletionRequest;
use App\Modules\Members\Models\Enums\DeletionRequestStatus;
use App\Modules\Members\Models\Membership;
use App\Support\Exceptions\DomainException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Completes a deletion request by anonymising the user's personal data. Memberships, orders,
 * payments, ledgers and audit rows are never deleted: financial and legal history is retained.
 *
 * What changes: name → 'Deleted Member', email → deleted-{id}@anonymized.local, mobile → null,
 * password/MFA/passkeys/API tokens/remember token/password-reset tokens cleared, account disabled,
 * every session ended, membership QR secret rotated (all issued cards stop verifying), referral code replaced
 * (the old code stops admitting registrations) and the free-text referral source / legacy notes cleared. Other modules purge their own PII copies on MemberAnonymized.
 * Idempotent: completing an already completed request returns it unchanged.
 */
final class AnonymizeMember
{
    public const ANONYMIZED_NAME = 'Deleted Member';

    public function __construct(private AuditService $audit, private SessionManager $sessions) {}

    public function execute(AccountDeletionRequest $request, User $actor, string $reason, ?string $notes = null): AccountDeletionRequest
    {
        if (mb_strlen(trim($reason)) < 5) {
            throw DomainException::because('core.errors.reason_required', field: 'reason');
        }

        return DB::transaction(function () use ($request, $actor, $reason, $notes) {
            /** @var AccountDeletionRequest $locked */
            $locked = AccountDeletionRequest::query()->whereKey($request->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === DeletionRequestStatus::Completed) {
                return $locked; // idempotent
            }
            if (! $locked->isOpen()) {
                throw DomainException::because('privacy.deletion.errors.not_open');
            }

            /** @var User $user */
            $user = User::query()->whereKey($locked->user_id)->lockForUpdate()->firstOrFail();
            $membership = $user->membership;
            $originalEmail = $user->email;
            // The audit trail is immutable, so it must not keep the very data being erased:
            // only non-identifying facts about what was removed are recorded.
            $before = ['status' => $user->status, 'had_mobile' => $user->mobile !== null, 'had_mfa' => $user->two_factor_secret !== null];

            $user->forceFill([
                'name' => self::ANONYMIZED_NAME,
                'email' => "deleted-{$user->id}@anonymized.local",
                'mobile' => null,
                'password' => Str::random(40),
                'remember_token' => null,
                'two_factor_secret' => null,
                'two_factor_recovery_codes' => null,
                'two_factor_confirmed_at' => null,
                'email_verified_at' => null,
                'mobile_verified_at' => null,
                'last_login_ip' => null,
                'status' => User::STATUS_DISABLED,
                'disabled_at' => $user->disabled_at ?? now(),
                'disabled_by' => $actor->id,
            ])->save();
            $user->tokens()->delete();
            $user->passkeys()->delete();
            DB::table('password_reset_tokens')->where('email', $originalEmail)->delete();

            if ($membership) {
                // Invalidate every QR token ever issued for this card; keep the membership row.
                $membership->rotateVerificationToken();
                // A fresh referral code: the old one is tied to the erased person and must stop admitting new
                // registrations (past referrals keep `member_referrals.referral_code_used`).
                $membership->forceFill(['referral_source' => null, 'notes' => null, 'referral_code' => Membership::generateReferralCode()])->save();
            }

            $locked->forceFill([
                'status' => DeletionRequestStatus::Completed,
                'processed_at' => now(),
                'processed_by' => $actor->id,
                'notes' => $notes,
            ])->save();

            $this->audit->log('members.anonymized', $membership ?? $user, old: $before, new: ['name' => self::ANONYMIZED_NAME, 'email' => $user->email, 'mobile' => null, 'status' => User::STATUS_DISABLED, 'deletion_request_id' => $locked->public_id], reason: $reason, actor: $actor, entityLabel: $membership?->member_number ?? "user:{$user->id}");
            SecurityEvents::record($user, 'account_disabled', ['anonymized' => true, 'by' => $actor->id]);
            $this->sessions->logoutAll($user);

            if ($membership) {
                DB::afterCommit(fn () => event(new MemberAnonymized($membership, $locked->id)));
            }

            return $locked;
        });
    }
}
