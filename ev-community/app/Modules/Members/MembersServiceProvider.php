<?php

namespace App\Modules\Members;

use App\Models\User;
use App\Modules\Members\Events\MembershipStatusChanged;
use App\Modules\Members\Models\AccountDeletionRequest;
use App\Modules\Members\Models\ConsentLog;
use App\Modules\Members\Models\Membership;
use App\Modules\Members\Policies\AccountDeletionRequestPolicy;
use App\Modules\Members\Policies\MembershipPolicy;
use App\Modules\Members\Services\MemberNotifier;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class MembersServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Gate::policy(Membership::class, MembershipPolicy::class);
        Gate::policy(AccountDeletionRequest::class, AccountDeletionRequestPolicy::class);

        User::resolveRelationUsing('deletionRequests', fn (User $user) => $user->hasMany(AccountDeletionRequest::class, 'user_id')->orderByDesc('id'));
        User::resolveRelationUsing('consentLogs', fn (User $user) => $user->hasMany(ConsentLog::class, 'user_id')->orderByDesc('id'));

        // Member notifications go through the Notifications module when it is available (see MemberNotifier).
        foreach (MembershipStatusChanged::concreteEvents() as $event) {
            Event::listen($event, [MemberNotifier::class, 'membershipStatusChanged']);
        }

        // Staff/partner scanners: generous but bounded (a queue at an event pickup desk scans fast).
        RateLimiter::for('member-verify', fn (Request $request) => Limit::perMinute(120)->by($request->user()?->id ?: $request->ip()));

        $this->callAfterResolving(Schedule::class, fn (Schedule $schedule) => $schedule->command('members:expire')->dailyAt('03:00'));
    }
}
