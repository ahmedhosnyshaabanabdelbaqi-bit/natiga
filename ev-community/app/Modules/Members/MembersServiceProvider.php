<?php

namespace App\Modules\Members;

use App\Models\User;
use App\Modules\Members\Events\MembershipStatusChanged;
use App\Modules\Members\Listeners\SendMembershipStatusNotification;
use App\Modules\Members\Models\AccountDeletionRequest;
use App\Modules\Members\Models\ConsentLog;
use App\Modules\Members\Models\Membership;
use App\Modules\Members\Policies\AccountDeletionRequestPolicy;
use App\Modules\Members\Policies\MembershipPolicy;
use App\Modules\System\Services\DashboardKpis;
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

        // Member notifications (queued, dedup-keyed) through the Notifications module.
        foreach (MembershipStatusChanged::concreteEvents() as $event) {
            Event::listen($event, SendMembershipStatusNotification::class);
        }

        // Staff/partner scanners: generous but bounded (a queue at an event pickup desk scans fast).
        RateLimiter::for('member-verify', fn (Request $request) => Limit::perMinute(120)->by($request->user()?->id ?: $request->ip()));
        // Member self-service writes (QR regeneration, deletion request, deactivation attempts).
        RateLimiter::for('member-self-service', fn (Request $request) => Limit::perMinute(10)->by($request->user()?->id ?: $request->ip()));

        DashboardKpis::register(
            'open_deletion_requests',
            'members.delete_requests',
            fn () => AccountDeletionRequest::query()->open()->count(),
            'members.kpis.open_deletion_requests',
            '/admin/members/deletion-requests',
            'account_deletion_requests.status in (requested, under_review)',
            tone: 'warning',
            order: 3,
        );

        $this->callAfterResolving(Schedule::class, fn (Schedule $schedule) => $schedule->command('members:expire')->dailyAt('03:00')->withoutOverlapping());
    }
}
