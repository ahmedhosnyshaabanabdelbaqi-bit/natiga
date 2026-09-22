<?php

namespace App\Modules\Rbac\Services;

use App\Modules\Rbac\Models\RoleMeta;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Idempotent synchronisation of roles/permissions from the registry into the database.
 * Existing role customisations made by admins are preserved: new default permissions are ADDED to
 * default roles, but permissions removed by an admin are not re-added unless `$reset` is true.
 * Role names (AR/EN) for registry roles are seeded into `role_meta` (custom roles are left untouched).
 */
final class RbacSync
{
    public function sync(bool $reset = false): array
    {
        $created = ['permissions' => 0, 'roles' => 0];
        $registry = PermissionRegistry::permissions();
        $newPermissions = [];

        foreach (array_keys($registry) as $name) {
            $permission = Permission::query()->firstOrCreate(['name' => $name, 'guard_name' => 'web']);
            if ($permission->wasRecentlyCreated) {
                $created['permissions']++;
                $newPermissions[] = $name;
            }
        }

        $grants = PermissionRegistry::defaultRoleGrants();
        $hasMeta = Schema::hasTable('role_meta');
        foreach (PermissionRegistry::ROLES as $slug => $definition) {
            $role = Role::query()->firstOrCreate(['name' => $slug, 'guard_name' => 'web']);
            if ($role->wasRecentlyCreated) {
                $created['roles']++;
                $role->syncPermissions($grants[$slug]);
            } elseif ($reset || PermissionRegistry::isSuperRole($slug)) {
                $role->syncPermissions($grants[$slug]);
            } else {
                // Only permissions that did not exist before this run are granted to their default roles; a default
                // permission an admin removed from a role stays removed (use --reset to restore registry defaults).
                $role->givePermissionTo(array_values(array_intersect($grants[$slug], $newPermissions)));
            }

            if ($hasMeta) {
                $this->syncMeta($role, $definition, $reset);
            }
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return $created;
    }

    /** @param  array{ar: string, en: string}  $definition */
    private function syncMeta(Role $role, array $definition, bool $reset): void
    {
        $meta = RoleMeta::query()->firstOrNew(['role_id' => $role->id]);
        if (! $meta->exists || $reset) {
            $meta->name_ar = $definition['ar'];
            $meta->name_en = $definition['en'];
        }
        $meta->is_system = true;
        $meta->save();
    }
}
