<?php

namespace App\Modules\Rbac\Policies;

use App\Models\User;
use App\Modules\Rbac\Services\PermissionRegistry;
use Spatie\Permission\Models\Role;

class RolePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->checkPermissionTo('roles.manage');
    }

    public function create(User $user): bool
    {
        return $user->checkPermissionTo('roles.manage');
    }

    public function update(User $user, Role $role): bool
    {
        return $user->checkPermissionTo('roles.manage') && ! PermissionRegistry::isSuperRole($role->name);
    }

    public function delete(User $user, Role $role): bool
    {
        return $user->checkPermissionTo('roles.manage') && ! isset(PermissionRegistry::ROLES[$role->name]);
    }
}
