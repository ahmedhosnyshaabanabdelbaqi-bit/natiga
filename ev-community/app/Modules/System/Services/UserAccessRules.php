<?php

namespace App\Modules\System\Services;

use App\Models\User;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Rbac\Services\PermissionRegistry;
use App\Support\Exceptions\DomainException;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

/**
 * Server-side rules for role/permission changes (defense in depth on top of `roles.manage`):
 *  - nobody changes their own roles/permissions;
 *  - only owner/super-admin may grant or revoke owner/super-admin, or touch a super user's access;
 *  - a non-super actor may only grant permissions they hold themselves (directly or through roles);
 *  - `member` is never assigned here (membership registration owns it).
 * Every blocked attempt is recorded as a critical security event on the actor.
 */
final class UserAccessRules
{
    /**
     * @param  string[]  $newRoles
     * @param  string[]  $newPermissions
     * @param  string[]  $oldRoles
     * @param  string[]  $oldPermissions
     */
    public function assertCanChange(User $actor, ?User $target, array $newRoles, array $newPermissions, array $oldRoles = [], array $oldPermissions = []): void
    {
        if ($target && $actor->is($target)) {
            $this->block($actor, 'self_privilege_change_blocked', ['target_id' => $target->id]);
            throw DomainException::forbidden('users.errors.cannot_change_own_access');
        }

        $this->assertKnown($newRoles, $newPermissions);

        $addedRoles = array_values(array_diff($newRoles, $oldRoles));
        $removedRoles = array_values(array_diff($oldRoles, $newRoles));
        $actorIsSuper = $actor->isSuperAdmin();

        if (! $actorIsSuper) {
            $superTouched = array_values(array_intersect(array_merge($addedRoles, $removedRoles), PermissionRegistry::SUPER_ROLES));
            $targetIsSuper = array_intersect($oldRoles, PermissionRegistry::SUPER_ROLES) !== [];
            if ($superTouched !== [] || $targetIsSuper) {
                $this->block($actor, 'permission_escalation_blocked', ['target_id' => $target?->id, 'roles' => $superTouched ?: $oldRoles]);
                throw DomainException::forbidden('users.errors.super_role_requires_super');
            }

            $granted = array_values(array_diff($newPermissions, $oldPermissions));
            if ($addedRoles !== []) {
                $rolePermissions = Role::query()->whereIn('name', $addedRoles)->where('guard_name', 'web')->with('permissions')->get()
                    ->flatMap(fn (Role $role) => $role->permissions->pluck('name'))->all();
                $granted = array_values(array_unique(array_merge($granted, $rolePermissions)));
            }
            $held = $actor->getAllPermissions()->pluck('name')->all();
            $notHeld = array_values(array_diff($granted, $held));
            if ($notHeld !== []) {
                $this->block($actor, 'permission_escalation_blocked', ['target_id' => $target?->id, 'permissions' => $notHeld]);
                throw DomainException::forbidden('users.errors.cannot_grant_unheld', ['permission' => implode(', ', array_slice($notHeld, 0, 5))]);
            }
        }
    }

    public function assertCanManage(User $actor, User $target, string $eventType = 'privileged_action_blocked'): void
    {
        if ($actor->is($target)) {
            throw DomainException::forbidden('users.errors.cannot_target_self');
        }
        if ($target->isSuperAdmin() && ! $actor->isSuperAdmin()) {
            $this->block($actor, $eventType, ['target_id' => $target->id]);
            throw DomainException::forbidden('users.errors.super_role_requires_super');
        }
    }

    /**
     * @param  string[]  $roles
     * @param  string[]  $permissions
     */
    private function assertKnown(array $roles, array $permissions): void
    {
        if (in_array('member', $roles, true)) {
            throw DomainException::because('users.errors.member_role_not_assignable', [], 'roles');
        }
        $knownRoles = Role::query()->where('guard_name', 'web')->whereIn('name', $roles)->pluck('name')->all();
        $unknownRoles = array_diff($roles, $knownRoles);
        if ($unknownRoles !== []) {
            throw DomainException::because('users.errors.unknown_role', ['role' => implode(', ', $unknownRoles)], 'roles');
        }
        $knownPermissions = Permission::query()->where('guard_name', 'web')->whereIn('name', $permissions)->pluck('name')->all();
        $unknownPermissions = array_diff($permissions, $knownPermissions);
        if ($unknownPermissions !== []) {
            throw DomainException::because('users.errors.unknown_permission', ['permission' => implode(', ', $unknownPermissions)], 'permissions');
        }
    }

    private function block(User $actor, string $type, array $meta): void
    {
        SecurityEvents::record($actor, $type, array_filter($meta, fn ($v) => $v !== null && $v !== []), 'critical');
    }
}
