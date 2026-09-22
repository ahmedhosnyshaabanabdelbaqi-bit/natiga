<?php

namespace App\Actions\Fortify;

use App\Concerns\PasswordValidationRules;
use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Membership;
use App\Modules\Members\Models\MembershipStatusHistory;
use App\Modules\System\Services\Settings;
use App\Support\Sequence\NumberSequence;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Laravel\Fortify\Contracts\CreatesNewUsers;

/**
 * Public registration always creates a *member* (never staff). Membership status depends on
 * the registration mode setting: open ⇒ active, admin_approval ⇒ pending, invitation_only ⇒
 * requires a valid referral/invitation code and becomes pending.
 */
class CreateNewUser implements CreatesNewUsers
{
    use PasswordValidationRules;

    /**
     * @param  array<string, string>  $input
     */
    public function create(array $input): User
    {
        $mode = Settings::get('members.registration_mode', 'admin_approval');
        $requireMobile = Settings::bool('members.require_mobile', true);

        Validator::make($input, [
            'name' => ['required', 'string', 'min:3', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique(User::class)],
            'mobile' => [$requireMobile ? 'required' : 'nullable', 'string', 'regex:/^(\+20|0)?1[0125][0-9]{8}$/', Rule::unique(User::class)],
            'governorate_id' => ['nullable', 'integer', Rule::exists('governorates', 'id')],
            'referral_source' => ['nullable', 'string', 'max:100'],
            'invitation_code' => [$mode === 'invitation_only' ? 'required' : 'nullable', 'string', 'max:16'],
            'preferred_locale' => ['nullable', Rule::in(ev_locales())],
            'password' => $this->passwordRules(),
            'terms' => ['accepted'],
        ], [], [
            'name' => __('auth.fields.name'), 'email' => __('auth.fields.email'), 'mobile' => __('auth.fields.mobile'),
            'password' => __('auth.fields.password'), 'terms' => __('auth.fields.terms'), 'invitation_code' => __('auth.fields.invitation_code'),
        ])->validate();

        $referrer = null;
        if (! empty($input['invitation_code'])) {
            $referrer = Membership::query()->where('referral_code', strtoupper(trim($input['invitation_code'])))->active()->first();
            if ($mode === 'invitation_only' && ! $referrer) {
                throw ValidationException::withMessages(['invitation_code' => __('auth.invalid_invitation_code')]);
            }
        }

        return DB::transaction(function () use ($input, $mode, $referrer) {
            $user = User::create([
                'name' => trim($input['name']),
                'email' => strtolower(trim($input['email'])),
                'mobile' => isset($input['mobile']) ? $this->normalizeMobile($input['mobile']) : null,
                'password' => $input['password'],
                'preferred_locale' => $input['preferred_locale'] ?? app()->getLocale(),
                'timezone' => config('ev.timezone'),
                'status' => User::STATUS_ACTIVE,
            ]);
            $user->assignRole('member');

            $status = $mode === 'open' ? MembershipStatus::Active : MembershipStatus::Pending;
            $membership = Membership::create([
                'user_id' => $user->id,
                'member_number' => NumberSequence::next('member'),
                'status' => $status,
                'governorate_id' => $input['governorate_id'] ?? null,
                'joined_at' => now(),
                'approved_at' => $status === MembershipStatus::Active ? now() : null,
                'referred_by' => $referrer?->id,
                'referral_source' => $input['referral_source'] ?? null,
            ]);
            MembershipStatusHistory::create(['membership_id' => $membership->id, 'from_status' => null, 'to_status' => $status->value, 'reason' => 'registration:'.$mode, 'created_at' => now()]);

            DB::table('consent_logs')->insert([
                ['user_id' => $user->id, 'consent_type' => 'terms', 'version' => $this->currentPolicyVersion('terms'), 'accepted_at' => now(), 'source' => 'web', 'ip_address' => request()?->ip(), 'created_at' => now()],
                ['user_id' => $user->id, 'consent_type' => 'privacy', 'version' => $this->currentPolicyVersion('privacy'), 'accepted_at' => now(), 'source' => 'web', 'ip_address' => request()?->ip(), 'created_at' => now()],
            ]);

            app(AuditService::class)->log('members.registered', $membership, new: ['status' => $status->value, 'mode' => $mode], actor: $user);
            SecurityEvents::record($user, 'registered');

            return $user;
        });
    }

    private function normalizeMobile(string $mobile): string
    {
        $digits = preg_replace('/\D+/', '', $mobile);
        if (str_starts_with($digits, '20')) {
            $digits = substr($digits, 2);
        }
        if (! str_starts_with($digits, '0')) {
            $digits = '0'.$digits;
        }

        return $digits;
    }

    private function currentPolicyVersion(string $type): ?string
    {
        return DB::table('policy_versions')->where('type', $type)->whereNotNull('published_at')->orderByDesc('published_at')->value('version');
    }
}
