<?php

namespace App\Modules\Audit;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Audit\Models\SecurityEvent;
use App\Modules\Audit\Policies\AuditLogPolicy;
use App\Modules\Audit\Policies\SecurityEventPolicy;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AuditServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Gate::policy(AuditLog::class, AuditLogPolicy::class);
        Gate::policy(SecurityEvent::class, SecurityEventPolicy::class);
    }
}
