<?php

namespace App\Modules\Rbac\Services;

use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Idempotent synchronisation of roles/permissions from the registry into the database.
 * Existing role customisations made by admins are preserved: new default permissions are ADDED to
 * default roles, but permissions removed by an admin are not re-added unless `$reset` is true.
 */
final class RbacSync
{
    public function sync(bool $reset = false): array
    {
        $created = ['permissions' => 0, 'roles' => 0];
        $registry = PermissionRegistry::permissions();

        foreach (array_keys($registry) as $name) {
            $permission = Permission::query()->firstOrCreate(['name' => $name, 'guard_name' => 'web']);
            if ($permission->wasRecentlyCreated) {
                $created['permissions']++;
            }
        }

        $grants = PermissionRegistry::defaultRoleGrants();
        foreach (PermissionRegistry::ROLES as $slug => $definition) {
            $role = Role::query()->firstOrCreate(['name' => $slug, 'guard_name' => 'web']);
            if ($role->wasRecentlyCreated) {
                $created['roles']++;
                $role->syncPermissions($grants[$slug]);
            } elseif ($reset || PermissionRegistry::isSuperRole($slug)) {
                $role->syncPermissions($grants[$slug]);
            } else {
                $existing = $role->permissions->pluck('name')->all();
                $role->givePermissionTo(array_diff($grants[$slug], $existing));
            }
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return $created;
    }
}
