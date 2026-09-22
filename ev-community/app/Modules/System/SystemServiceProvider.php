<?php

namespace App\Modules\System;

use App\Models\User;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Membership;
use App\Modules\Reports\Operations\OperationsServiceProvider;
use App\Modules\System\Models\StatusBanner;
use App\Modules\System\Policies\StatusBannerPolicy;
use App\Modules\System\Policies\UserPolicy;
use App\Modules\System\Services\DashboardKpis;
use App\Modules\System\Services\SchedulerHeartbeat;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class SystemServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Operations exception center / incidents live under app/Modules/Reports/Operations and are booted here
        // until the Reports module gets its own ReportsServiceProvider (integration pass: move this line there).
        if (class_exists(OperationsServiceProvider::class)) {
            $this->app->register(OperationsServiceProvider::class);
        }
    }

    public function boot(): void
    {
        Gate::policy(User::class, UserPolicy::class);
        Gate::policy(StatusBanner::class, StatusBannerPolicy::class);

        DashboardKpis::register('active_members', 'members.view', fn () => Membership::query()->where('status', MembershipStatus::Active->value)->count(), 'admin.dashboard.active_members', '/admin/members?status=active', 'memberships.status = active', order: 1);
        DashboardKpis::register('pending_members', 'members.view', fn () => Membership::query()->where('status', MembershipStatus::Pending->value)->count(), 'admin.dashboard.pending_members', '/admin/members?status=pending', 'memberships.status = pending', tone: 'warning', order: 2);

        $this->callAfterResolving(Schedule::class, function (Schedule $schedule) {
            $schedule->call(fn () => SchedulerHeartbeat::beat())->everyMinute()->name('ev:scheduler-heartbeat')->withoutOverlapping();
        });
    }
}
