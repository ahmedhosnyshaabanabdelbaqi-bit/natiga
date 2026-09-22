<?php

namespace App\Modules\System\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Rbac\Services\PermissionRegistry;
use App\Modules\System\Services\UserAccessRules;
use App\Support\Exceptions\DomainException;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\PermissionRegistrar;

/**
 * Replaces a user's roles and direct permission overrides. Turning a member into staff is exactly this
 * audited action; there is no other path. The `member` role is preserved as-is (it belongs to membership).
 *
 * The rules are checked twice: once before the transaction (so a blocked attempt's security event is
 * committed even though the change is refused) and again on the row-locked state inside the transaction.
 */
final class ChangeUserAccess
{
    public function __construct(private readonly AuditService $audit, private readonly UserAccessRules $rules) {}

    /**
     * @param  string[]  $roles  requested roles (the member role is never requested; it is kept automatically)
     * @param  string[]  $permissions  requested direct permissions
     */
    public function execute(User $target, array $roles, array $permissions, User $actor, ?string $reason = null): User
    {
        $requestedRoles = $this->normalize($roles);
        $requestedPermissions = $this->normalize($permissions);

        [$oldRoles, $oldPermissions] = $this->current($target);
        $this->rules->assertCanChange($actor, $target, $requestedRoles, $requestedPermissions, $this->withoutMember($oldRoles), $oldPermissions);

        return DB::transaction(function () use ($target, $requestedRoles, $requestedPermissions, $actor, $reason) {
            $target = User::query()->whereKey($target->id)->lockForUpdate()->firstOrFail();
            [$oldRoles, $oldPermissions] = $this->current($target);
            $this->rules->assertCanChange($actor, $target, $requestedRoles, $requestedPermissions, $this->withoutMember($oldRoles), $oldPermissions);

            $newRoles = $this->normalize(array_merge(array_intersect($oldRoles, ['member']), $requestedRoles));
            $newPermissions = $requestedPermissions;

            if ($newRoles === $oldRoles && $newPermissions === $oldPermissions) {
                return $target;
            }
            if (in_array('owner', $oldRoles, true) && ! in_array('owner', $newRoles, true)
                && User::query()->role('owner')->where('status', User::STATUS_ACTIVE)->whereKeyNot($target->id)->doesntExist()) {
                throw DomainException::forbidden('users.errors.last_owner');
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

    /** @return array{0: string[], 1: string[]} current roles and direct permissions, sorted */
    private function current(User $user): array
    {
        $user->unsetRelation('roles')->unsetRelation('permissions');

        return [
            $user->getRoleNames()->sort()->values()->all(),
            $user->getDirectPermissions()->pluck('name')->sort()->values()->all(),
        ];
    }

    /**
     * @param  string[]  $values
     * @return string[]
     */
    private function normalize(array $values): array
    {
        $values = array_values(array_unique(array_map('strval', $values)));
        sort($values);

        return $values;
    }

    /**
     * @param  string[]  $roles
     * @return string[]
     */
    private function withoutMember(array $roles): array
    {
        return array_values(array_diff($roles, ['member']));
    }
}
