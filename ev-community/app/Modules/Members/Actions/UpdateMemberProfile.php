<?php

namespace App\Modules\Members\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Members\Models\Membership;
use Illuminate\Support\Facades\DB;

/**
 * Profile edits by staff (name/email/mobile/governorate/locale) or by the member themselves
 * (mobile/governorate/locale/referral source). Audited as members.profile_updated with old/new.
 */
final class UpdateMemberProfile
{
    private const USER_FIELDS = ['name', 'email', 'mobile', 'preferred_locale'];

    private const MEMBERSHIP_FIELDS = ['governorate_id', 'referral_source'];

    public function __construct(private AuditService $audit) {}

    /** @param  array<string, mixed>  $data */
    public function execute(Membership $membership, array $data, User $actor, ?string $reason = null): Membership
    {
        return DB::transaction(function () use ($membership, $data, $actor, $reason) {
            $user = $membership->user;
            $before = $user->only(self::USER_FIELDS) + $membership->only(self::MEMBERSHIP_FIELDS);

            $userData = array_intersect_key($data, array_flip(self::USER_FIELDS));
            if (array_key_exists('email', $userData)) {
                $userData['email'] = strtolower(trim((string) $userData['email']));
            }
            if (array_key_exists('mobile', $userData)) {
                $userData['mobile'] = $userData['mobile'] === null || $userData['mobile'] === '' ? null : self::normalizeMobile((string) $userData['mobile']);
            }
            if (array_key_exists('name', $userData)) {
                $userData['name'] = trim((string) $userData['name']);
            }
            $user->fill($userData);
            if ($user->isDirty('email')) {
                $user->email_verified_at = null;
            }
            $user->save();

            $membership->fill(array_intersect_key($data, array_flip(self::MEMBERSHIP_FIELDS)));
            $membership->save();

            $after = $user->only(self::USER_FIELDS) + $membership->only(self::MEMBERSHIP_FIELDS);
            $this->audit->logChanges('members.profile_updated', $membership, $before, $after, $reason, $actor);

            return $membership;
        });
    }

    public static function normalizeMobile(string $mobile): string
    {
        $digits = preg_replace('/\D+/', '', $mobile) ?? '';
        if (str_starts_with($digits, '20')) {
            $digits = substr($digits, 2);
        }
        if (! str_starts_with($digits, '0')) {
            $digits = '0'.$digits;
        }

        return $digits;
    }
}
