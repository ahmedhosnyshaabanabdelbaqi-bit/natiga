<?php

namespace App\Modules\Rbac;

use App\Modules\Rbac\Policies\RolePolicy;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;
use Spatie\Permission\Models\Role;

class RbacServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Gate::policy(Role::class, RolePolicy::class);
    }
}
