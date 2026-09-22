<?php

namespace App\Modules\Reports\Operations\Policies;

use App\Models\User;
use App\Modules\Reports\Operations\Models\Incident;

class IncidentPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->checkPermissionTo('incidents.view') || $user->checkPermissionTo('incidents.manage');
    }

    public function view(User $user, Incident $incident): bool
    {
        return $this->viewAny($user);
    }

    public function create(User $user): bool
    {
        return $user->checkPermissionTo('incidents.manage');
    }

    public function update(User $user, Incident $incident): bool
    {
        return $user->checkPermissionTo('incidents.manage');
    }

    public function transition(User $user, Incident $incident): bool
    {
        return $user->checkPermissionTo('incidents.manage');
    }

    public function comment(User $user, Incident $incident): bool
    {
        return $user->checkPermissionTo('incidents.manage');
    }
}
