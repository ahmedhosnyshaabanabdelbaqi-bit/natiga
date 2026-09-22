<?php

namespace App\Modules\Rbac\Services;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Rbac\Models\RoleMeta;
use App\Support\Exceptions\DomainException;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Role matrix operations: create custom roles, change a role's permissions, delete unused custom roles.
 * Every change is audited. Super roles are read-only (they implicitly hold everything).
 */
final class RoleManager
{
    public function __construct(private readonly AuditService $audit) {}

    /** @return array<int, array<string, mixed>> */
    public function matrix(): array
    {
        $roles = Role::query()->where('guard_name', 'web')->with('permissions')->withCount('users')->orderBy('id')->get();
        $meta = RoleMeta::query()->whereIn('role_id', $roles->pluck('id'))->get()->keyBy('role_id');

        return $roles->map(function (Role $role) use ($meta) {
            /** @var RoleMeta|null $m */
            $m = $meta->get($role->id);
            $registry = PermissionRegistry::ROLES[$role->name] ?? null;

            return [
                'id' => $role->id,
                'slug' => $role->name,
                'name_ar' => $m?->name_ar ?? $registry['ar'] ?? $role->name,
                'name_en' => $m?->name_en ?? $registry['en'] ?? $role->name,
                'description' => $m?->description,
                'is_system' => $m?->is_system ?? ($registry !== null),
                'is_super' => PermissionRegistry::isSuperRole($role->name),
                'portal' => $registry['portal'] ?? 'admin',
                'users_count' => (int) $role->users_count,
                'permissions' => PermissionRegistry::isSuperRole($role->name)
                    ? array_keys(PermissionRegistry::permissions())
                    : $role->permissions->pluck('name')->values()->all(),
            ];
        })->values()->all();
    }

    public function create(string $slug, string $nameAr, string $nameEn, ?string $description, User $actor): Role
    {
        if (isset(PermissionRegistry::ROLES[$slug]) || Role::query()->where('name', $slug)->where('guard_name', 'web')->exists()) {
            throw DomainException::because('roles.errors.slug_taken', ['slug' => $slug], 'slug');
        }

        return DB::transaction(function () use ($slug, $nameAr, $nameEn, $description, $actor) {
            $role = Role::query()->create(['name' => $slug, 'guard_name' => 'web']);
            RoleMeta::query()->create([
                'role_id' => $role->id, 'name_ar' => $nameAr, 'name_en' => $nameEn, 'description' => $description,
                'is_system' => false, 'created_by' => $actor->id,
            ]);
            $this->audit->log('roles.created', $role, new: ['slug' => $slug, 'name_ar' => $nameAr, 'name_en' => $nameEn], actor: $actor);
            app(PermissionRegistrar::class)->forgetCachedPermissions();

            return $role;
        });
    }

    /**
     * @param  string[]  $permissions
     */
    public function syncPermissions(Role $role, array $permissions, User $actor, ?string $reason = null): void
    {
        if (PermissionRegistry::isSuperRole($role->name)) {
            throw DomainException::forbidden('roles.errors.super_role_readonly');
        }
        $known = array_keys(PermissionRegistry::permissions());
        $unknown = array_diff($permissions, $known);
        if ($unknown !== []) {
            throw DomainException::because('roles.errors.unknown_permission', ['permission' => implode(', ', $unknown)], 'permissions');
        }

        $old = $role->permissions->pluck('name')->sort()->values()->all();
        $new = array_values(array_unique($permissions));
        sort($new);
        $added = array_values(array_diff($new, $old));
        $removed = array_values(array_diff($old, $new));
        if ($added === [] && $removed === []) {
            return;
        }

        // Privilege escalation guard: a non-super actor may only grant permissions they hold themselves.
        if (! $actor->isSuperAdmin()) {
            $held = $actor->getAllPermissions()->pluck('name')->all();
            $notHeld = array_values(array_diff($added, $held));
            if ($notHeld !== []) {
                SecurityEvents::record($actor, 'permission_escalation_blocked', ['role' => $role->name, 'permissions' => $notHeld], 'critical');
                throw DomainException::forbidden('roles.errors.cannot_grant_unheld', ['permission' => implode(', ', $notHeld)]);
            }
        }

        DB::transaction(function () use ($role, $new, $old, $added, $removed, $actor, $reason) {
            $role->syncPermissions(Permission::query()->whereIn('name', $new)->where('guard_name', 'web')->get());
            $this->audit->log('roles.permissions_changed', $role, old: ['permissions' => $old], new: ['permissions' => $new, 'added' => $added, 'removed' => $removed], reason: $reason, actor: $actor);
            app(PermissionRegistrar::class)->forgetCachedPermissions();
        });
    }

    public function delete(Role $role, User $actor, ?string $reason = null): void
    {
        $meta = RoleMeta::query()->where('role_id', $role->id)->first();
        if (isset(PermissionRegistry::ROLES[$role->name]) || ($meta?->is_system ?? false)) {
            throw DomainException::forbidden('roles.errors.system_role_undeletable');
        }
        if ($role->users()->exists()) {
            throw DomainException::conflict('roles.errors.role_in_use', ['count' => $role->users()->count()]);
        }

        DB::transaction(function () use ($role, $meta, $actor, $reason) {
            $permissions = $role->permissions->pluck('name')->values()->all();
            $meta?->delete();
            $role->delete();
            $this->audit->log('roles.deleted', null, old: ['slug' => $role->name, 'permissions' => $permissions], reason: $reason, actor: $actor, entityLabel: $role->name);
            app(PermissionRegistrar::class)->forgetCachedPermissions();
        });
    }
}
