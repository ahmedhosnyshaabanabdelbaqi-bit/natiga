<?php

declare(strict_types=1);

namespace App\Modules\Access\Services;

use App\Models\User;
use App\Support\Exceptions\PermissionDeniedException;
use Illuminate\Support\Facades\DB;

/**
 * Server-side authorisation.
 *
 * A permission is granted when a role the user holds (globally or in the target
 * branch) carries it, unless a per-user DENY override applies. Denies always win
 * so a single user can be stripped of a sensitive action without inventing a new
 * role.
 */
class PermissionService
{
    /** @var array<string,array<string,bool>> */
    private array $cache = [];

    public function userCan(User $user, string $permission, ?int $branchId = null): bool
    {
        if (! $user->is_active) {
            return false;
        }

        $cacheKey = $user->id.'|'.($branchId ?? 0);

        if (! isset($this->cache[$cacheKey])) {
            $this->cache[$cacheKey] = $this->resolve($user, $branchId);
        }

        return $this->cache[$cacheKey][$permission] ?? false;
    }

    public function authorize(User $user, string $permission, ?int $branchId = null): void
    {
        if (! $this->userCan($user, $permission, $branchId)) {
            throw new PermissionDeniedException(
                'ليست لديك صلاحية تنفيذ هذه العملية.',
                'permission_denied',
                403,
                ['permission' => $permission],
            );
        }
    }

    /** @return array<string,bool> */
    public function permissionsFor(User $user, ?int $branchId = null): array
    {
        $cacheKey = $user->id.'|'.($branchId ?? 0);
        $this->cache[$cacheKey] ??= $this->resolve($user, $branchId);

        return array_keys(array_filter($this->cache[$cacheKey]));
    }

    /** @return array<string,bool> */
    private function resolve(User $user, ?int $branchId): array
    {
        $granted = [];

        // Role permissions: a role granted with branch_id = NULL applies everywhere.
        $rolePermissions = DB::table('role_user')
            ->join('permission_role', 'permission_role.role_id', '=', 'role_user.role_id')
            ->join('permissions', 'permissions.id', '=', 'permission_role.permission_id')
            ->where('role_user.user_id', $user->id)
            ->where(function ($q) use ($branchId) {
                $q->whereNull('role_user.branch_id');
                if ($branchId !== null) {
                    $q->orWhere('role_user.branch_id', $branchId);
                }
            })
            ->pluck('permissions.code');

        foreach ($rolePermissions as $code) {
            $granted[$code] = true;
        }

        // Per-user overrides, denies last so they cannot be overruled.
        $overrides = DB::table('permission_user')
            ->join('permissions', 'permissions.id', '=', 'permission_user.permission_id')
            ->where('permission_user.user_id', $user->id)
            ->where(function ($q) use ($branchId) {
                $q->whereNull('permission_user.branch_id');
                if ($branchId !== null) {
                    $q->orWhere('permission_user.branch_id', $branchId);
                }
            })
            ->get(['permissions.code', 'permission_user.granted']);

        foreach ($overrides as $row) {
            if ($row->granted) {
                $granted[$row->code] = true;
            }
        }
        foreach ($overrides as $row) {
            if (! $row->granted) {
                $granted[$row->code] = false;
            }
        }

        return $granted;
    }

    /** Branch scoping: may this user act in this branch at all? */
    public function canAccessBranch(User $user, ?int $branchId): bool
    {
        if ($branchId === null) {
            return true;
        }

        $allowed = $user->accessibleBranchIds();

        return $allowed === [] || in_array($branchId, $allowed, true);
    }

    public function flush(): void
    {
        $this->cache = [];
    }
}
