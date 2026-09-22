<?php

namespace App\Modules\System;

use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Membership;
use App\Modules\System\Services\DashboardKpis;
use Illuminate\Support\ServiceProvider;

class SystemServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        DashboardKpis::register('active_members', 'members.view', fn () => Membership::query()->where('status', MembershipStatus::Active->value)->count(), 'admin.dashboard.active_members', '/admin/members?status=active', 'memberships.status = active', order: 1);
        DashboardKpis::register('pending_members', 'members.view', fn () => Membership::query()->where('status', MembershipStatus::Pending->value)->count(), 'admin.dashboard.pending_members', '/admin/members?status=pending', 'memberships.status = pending', tone: 'warning', order: 2);
    }
}
