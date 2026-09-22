<?php

namespace App\Modules\System\Policies;

use App\Models\User;
use App\Modules\System\Services\StaffUsers;

/**
 * Admin user management. Super roles pass via Gate::before; everything else needs the explicit permission.
 * Business rules (self-change, super targets, unheld permissions) live in UserAccessRules.
 *
 * Scope: the admin "users" area manages staff and partner accounts. A plain member account is only reachable
 * here by someone holding `roles.manage` (to grant staff access, the only way to turn a member into staff);
 * members are otherwise managed from the Members module. This prevents `users.view` from becoming an IDOR
 * into member profiles by public id.
 */
class UserPolicy
{
    public function viewAny(User $user): bool
    {
        return $this->any($user, ['users.view', 'users.manage']);
    }

    public function view(User $user, User $target): bool
    {
        return $this->any($user, ['users.view', 'users.manage']) && $this->inScope($user, $target);
    }

    /** Creating a staff account grants access, so it needs both user and role management. */
    public function create(User $user): bool
    {
        return $user->checkPermissionTo('users.manage') && $user->checkPermissionTo('roles.manage');
    }

    public function update(User $user, User $target): bool
    {
        return $user->checkPermissionTo('users.manage') && $this->inScope($user, $target);
    }

    public function changeAccess(User $user, User $target): bool
    {
        return $user->checkPermissionTo('roles.manage') && ! $user->is($target);
    }

    public function disable(User $user, User $target): bool
    {
        return $user->checkPermissionTo('users.manage') && ! $user->is($target) && $this->inScope($user, $target);
    }

    public function reactivate(User $user, User $target): bool
    {
        return $user->checkPermissionTo('users.manage') && ! $user->is($target) && $this->inScope($user, $target);
    }

    public function resetAccess(User $user, User $target): bool
    {
        return $user->checkPermissionTo('users.manage') && ! $user->is($target) && $this->inScope($user, $target);
    }

    /** Revoking a super account's sessions is reserved to super actors (Gate::before lets those through). */
    public function manageSessions(User $user, User $target): bool
    {
        if ($user->is($target)) {
            return $user->checkPermissionTo('users.manage');
        }

        return $user->checkPermissionTo('users.manage') && ! $target->isSuperAdmin() && $this->inScope($user, $target);
    }

    private function inScope(User $actor, User $target): bool
    {
        return $actor->is($target) || app(StaffUsers::class)->isStaffAccount($target) || $actor->checkPermissionTo('roles.manage');
    }

    /** @param  string[]  $permissions */
    private function any(User $user, array $permissions): bool
    {
        foreach ($permissions as $permission) {
            if ($user->checkPermissionTo($permission)) {
                return true;
            }
        }

        return false;
    }
}
