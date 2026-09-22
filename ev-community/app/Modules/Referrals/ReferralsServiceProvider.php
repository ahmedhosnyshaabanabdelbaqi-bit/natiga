<?php

namespace App\Modules\Referrals;

use App\Models\User;
use App\Modules\Members\Events\MembershipApproved;
use App\Modules\Referrals\Services\ReferralService;
use Illuminate\Auth\Events\Registered;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

class ReferralsServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        // Registration (Fortify → CreateNewUser) sets memberships.referred_by; we mirror it into member_referrals.
        Event::listen(Registered::class, function (Registered $event) {
            $user = $event->user;
            if ($user instanceof User && ($membership = $user->membership()->first())) {
                app(ReferralService::class)->recordRegistration($membership);
            }
        });

        Event::listen(MembershipApproved::class, fn (MembershipApproved $event) => app(ReferralService::class)->markApproved($event->membership));
    }
}
