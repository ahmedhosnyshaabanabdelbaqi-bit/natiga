<?php

namespace App\Modules\Audit\Policies;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;

class AuditLogPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->checkPermissionTo('audit.view');
    }

    public function view(User $user, AuditLog $log): bool
    {
        return $user->checkPermissionTo('audit.view');
    }

    public function export(User $user): bool
    {
        return $user->checkPermissionTo('audit.view');
    }

    /** Nobody, ever — including super roles (Gate::before is bypassed by the DB trigger anyway). */
    public function update(User $user, AuditLog $log): bool
    {
        return false;
    }

    public function delete(User $user, AuditLog $log): bool
    {
        return false;
    }
}
