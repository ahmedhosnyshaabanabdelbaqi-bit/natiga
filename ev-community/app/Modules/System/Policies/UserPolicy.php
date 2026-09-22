<?php

namespace App\Modules\System\Policies;

use App\Models\User;

/**
 * Admin user management. Super roles pass via Gate::before; everything else needs the explicit permission.
 * Business rules (self-change, super targets, unheld permissions) live in UserAccessRules.
 */
class UserPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->checkPermissionTo('users.view');
    }

    public function view(User $user, User $target): bool
    {
        return $user->checkPermissionTo('users.view');
    }

    public function create(User $user): bool
    {
        return $user->checkPermissionTo('users.manage');
    }

    public function update(User $user, User $target): bool
    {
        return $user->checkPermissionTo('users.manage');
    }

    public function changeAccess(User $user, User $target): bool
    {
        return $user->checkPermissionTo('roles.manage') && ! $user->is($target);
    }

    public function disable(User $user, User $target): bool
    {
        return $user->checkPermissionTo('users.manage') && ! $user->is($target);
    }

    public function reactivate(User $user, User $target): bool
    {
        return $user->checkPermissionTo('users.manage') && ! $user->is($target);
    }

    public function resetAccess(User $user, User $target): bool
    {
        return $user->checkPermissionTo('users.manage') && ! $user->is($target);
    }

    public function manageSessions(User $user, User $target): bool
    {
        return $user->checkPermissionTo('users.manage');
    }
}
