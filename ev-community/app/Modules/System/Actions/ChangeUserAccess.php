<?php

namespace App\Modules\System\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Rbac\Services\PermissionRegistry;
use App\Modules\System\Services\UserAccessRules;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\PermissionRegistrar;

/**
 * Replaces a user's roles and direct permission overrides. Turning a member into staff is exactly this
 * audited action; there is no other path. The `member` role is preserved as-is.
 */
final class ChangeUserAccess
{
    public function __construct(private readonly AuditService $audit, private readonly UserAccessRules $rules) {}

    /**
     * @param  string[]  $roles
     * @param  string[]  $permissions
     */
    public function execute(User $target, array $roles, array $permissions, User $actor, ?string $reason = null): User
    {
        return DB::transaction(function () use ($target, $roles, $permissions, $actor, $reason) {
            $target = User::query()->whereKey($target->id)->lockForUpdate()->firstOrFail();
            $oldRoles = $target->getRoleNames()->sort()->values()->all();
            $oldPermissions = $target->getDirectPermissions()->pluck('name')->sort()->values()->all();

            $newRoles = array_values(array_unique(array_merge(array_intersect($oldRoles, ['member']), $roles)));
            sort($newRoles);
            $newPermissions = array_values(array_unique($permissions));
            sort($newPermissions);

            $this->rules->assertCanChange($actor, $target, $newRoles, $newPermissions, $oldRoles, $oldPermissions);

            if ($newRoles === $oldRoles && $newPermissions === $oldPermissions) {
                return $target;
            }

            $target->syncRoles($newRoles);
            $target->syncPermissions($newPermissions);
            app(PermissionRegistrar::class)->forgetCachedPermissions();

            $this->audit->log('users.roles_changed', $target,
                old: ['roles' => $oldRoles, 'permissions' => $oldPermissions],
                new: ['roles' => $newRoles, 'permissions' => $newPermissions],
                reason: $reason, actor: $actor);

            if ($newRoles !== $oldRoles) {
                SecurityEvents::record($target, 'role_changed', ['by' => $actor->id, 'old' => $oldRoles, 'new' => $newRoles]);
            }
            $grantedSuper = array_values(array_intersect(array_diff($newRoles, $oldRoles), PermissionRegistry::SUPER_ROLES));
            if ($grantedSuper !== []) {
                SecurityEvents::record($target, 'permission_escalation', ['by' => $actor->id, 'roles' => $grantedSuper]);
            }
            if ($newPermissions !== $oldPermissions) {
                SecurityEvents::record($target, 'permissions_changed', ['by' => $actor->id, 'old' => $oldPermissions, 'new' => $newPermissions], 'warning');
            }

            return $target->unsetRelation('roles')->unsetRelation('permissions');
        });
    }
}
