<?php

namespace App\Modules\Referrals\Services;

use App\Modules\Members\Models\Membership;
use App\Modules\Referrals\Models\Enums\ReferralStatus;
use App\Modules\Referrals\Models\MemberReferral;
use App\Modules\System\Services\Modules;
use App\Modules\System\Services\Settings;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;

/**
 * Referral tracking only: who invited whom and whether the invitee got approved.
 * There are deliberately no monetary rewards, credits or ledger entries here.
 */
final class ReferralService
{
    public function enabled(): bool
    {
        return Modules::enabled('referrals') && Settings::bool('referrals.enabled', true);
    }

    /** Creates the tracking row for a membership registered with a referral code (idempotent). */
    public function recordRegistration(Membership $referred): ?MemberReferral
    {
        if (! $referred->referred_by || $referred->referred_by === $referred->id) {
            return null;
        }
        $existing = MemberReferral::query()->where('referred_membership_id', $referred->id)->first();
        if ($existing) {
            return $existing;
        }
        $referrer = Membership::query()->find($referred->referred_by);
        if (! $referrer) {
            return null;
        }
        $approved = $referred->isActive();

        return MemberReferral::create([
            'referrer_membership_id' => $referrer->id,
            'referred_membership_id' => $referred->id,
            'referral_code_used' => $referrer->referral_code,
            'status' => $approved ? ReferralStatus::Approved : ReferralStatus::Registered,
            'created_at' => now(),
            'approved_at' => $approved ? now() : null,
        ]);
    }

    /** Flips the referral to approved once the referred membership is activated (lazy backfill included). */
    public function markApproved(Membership $referred): ?MemberReferral
    {
        $referral = $this->recordRegistration($referred);
        if ($referral && $referral->status !== ReferralStatus::Approved) {
            $referral->forceFill(['status' => ReferralStatus::Approved, 'approved_at' => now()])->save();
        }

        return $referral;
    }

    /** Ensures every membership referred by `$referrer` has a tracking row (covers rows created before the module existed). */
    public function backfillFor(Membership $referrer): void
    {
        Membership::query()->where('referred_by', $referrer->id)
            ->whereNotIn('id', MemberReferral::query()->select('referred_membership_id')->where('referrer_membership_id', $referrer->id))
            ->get()->each(fn (Membership $referred) => $this->recordRegistration($referred));
    }

    /** @return array{invited: int, registered: int, approved: int} */
    public function statsFor(Membership $referrer): array
    {
        $counts = MemberReferral::query()->where('referrer_membership_id', $referrer->id)
            ->selectRaw('status, count(*) as aggregate')->groupBy('status')->pluck('aggregate', 'status');
        $invited = (int) $counts->sum();
        $approved = (int) ($counts[ReferralStatus::Approved->value] ?? 0);
        $registered = (int) ($counts[ReferralStatus::Registered->value] ?? 0) + $approved;

        return ['invited' => $invited, 'registered' => $registered, 'approved' => $approved];
    }

    /**
     * Referred members as seen by the referrer: first name + status only (no contact data).
     *
     * @return array<int, array{first_name: string, status: string, joined_at: ?string}>
     */
    public function referredList(Membership $referrer, int $limit = 100): array
    {
        return MemberReferral::query()->with('referred.user')->where('referrer_membership_id', $referrer->id)
            ->orderByDesc('id')->limit($limit)->get()
            ->map(fn (MemberReferral $r) => [
                'first_name' => Str::of((string) $r->referred?->user?->name)->trim()->explode(' ')->first() ?: '—',
                'status' => $r->status->value,
                'joined_at' => $r->created_at?->toIso8601String(),
            ])->all();
    }

    public function shareLink(Membership $membership): string
    {
        return Route::has('register')
            ? route('register', ['ref' => $membership->referral_code])
            : url('/register?ref='.$membership->referral_code);
    }
}
