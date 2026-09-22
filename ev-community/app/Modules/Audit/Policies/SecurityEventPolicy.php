<?php

namespace App\Modules\Audit\Policies;

use App\Models\User;

class SecurityEventPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->checkPermissionTo('security_events.view');
    }
}
