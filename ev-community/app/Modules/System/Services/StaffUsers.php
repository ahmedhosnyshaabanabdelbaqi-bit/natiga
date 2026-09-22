<?php

namespace App\Modules\System\Services;

use App\Models\User;
use App\Modules\Audit\Models\SecurityEvent;
use App\Modules\Rbac\Models\RoleMeta;
use App\Modules\Rbac\Services\PermissionRegistry;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Spatie\Permission\Models\Role;

/**
 * Listing/serialization of "staff" users: anyone holding a non-member role or admin/partner access.
 */
final class StaffUsers
{
    public const ALLOWED_SORTS = ['name', 'email', 'last_login_at', 'created_at', 'status'];

    public const ALLOWED_FILTERS = ['q', 'role', 'status', 'mfa', 'sort', 'direction', 'per_page'];

    public const PER_PAGE = [15, 25, 50, 100];

    /** Roles that make an account a staff/partner account (everything except `member`). */
    public const STAFF_ACCESS_PERMISSIONS = ['admin.access', 'partner.access'];

    public const LOGIN_EVENT_TYPES = ['login_succeeded', 'login_failed', 'login_lockout', 'login_blocked_disabled', 'logout'];

    /** @return Builder<User> */
    public function scope(): Builder
    {
        return User::query()->where(function (Builder $q) {
            $q->whereHas('roles', fn (Builder $r) => $r->where('name', '!=', 'member'))
                ->orWhereHas('permissions', fn (Builder $p) => $p->whereIn('name', self::STAFF_ACCESS_PERMISSIONS));
        });
    }

    /** Whether the account belongs to the staff/partner population managed from /admin/users. */
    public function isStaffAccount(User $user): bool
    {
        return $this->scope()->whereKey($user->id)->exists();
    }

    /** @param  array<string, mixed>  $filters */
    public function paginate(array $filters, ?int $perPage = null): LengthAwarePaginator
    {
        $perPage ??= in_array((int) ($filters['per_page'] ?? 0), self::PER_PAGE, true) ? (int) $filters['per_page'] : 25;
        $query = $this->scope()->with('roles');

        if (($q = trim((string) ($filters['q'] ?? ''))) !== '') {
            $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $q).'%';
            $query->where(fn (Builder $w) => $w->where('name', 'ILIKE', $like)->orWhere('email', 'ILIKE', $like)->orWhere('mobile', 'ILIKE', $like));
        }
        if (is_string($filters['role'] ?? null) && $filters['role'] !== '') {
            $query->whereHas('roles', fn (Builder $r) => $r->where('name', $filters['role']));
        }
        if (in_array($filters['status'] ?? null, [User::STATUS_ACTIVE, User::STATUS_DISABLED], true)) {
            $query->where('status', $filters['status']);
        }
        if (($filters['mfa'] ?? null) === 'enabled') {
            $query->whereNotNull('two_factor_confirmed_at');
        } elseif (($filters['mfa'] ?? null) === 'disabled') {
            $query->whereNull('two_factor_confirmed_at');
        }

        $sort = in_array($filters['sort'] ?? null, self::ALLOWED_SORTS, true) ? $filters['sort'] : 'created_at';
        $dir = ($filters['direction'] ?? 'desc') === 'asc' ? 'asc' : 'desc';
        $query->orderBy($sort, $dir)->orderBy('id');

        return $query->paginate($perPage)->withQueryString()->through(fn (User $user) => $this->summary($user));
    }

    /** @return array<string, mixed> */
    public function summary(User $user): array
    {
        return [
            'id' => $user->public_id,
            'name' => $user->name,
            'email' => $user->email,
            'mobile' => $user->mobile,
            'status' => $user->status,
            'preferred_locale' => $user->preferred_locale,
            'roles' => $user->getRoleNames()->values()->all(),
            'is_super' => $user->isSuperAdmin(),
            'mfa_enabled' => $user->hasMfaEnabled(),
            'last_login_at' => $user->last_login_at?->toIso8601String(),
            'created_at' => $user->created_at?->toIso8601String(),
            'disabled_at' => $user->disabled_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    public function detail(User $user): array
    {
        $direct = $user->getDirectPermissions()->pluck('name')->sort()->values()->all();
        $viaRoles = $user->getPermissionsViaRoles()->pluck('name')->sort()->values()->all();

        return $this->summary($user) + [
            'email_verified_at' => $user->email_verified_at?->toIso8601String(),
            'last_login_ip' => $user->last_login_ip,
            'password_changed_at' => $user->password_changed_at?->toIso8601String(),
            'disabled_by' => $user->disabled_by ? User::query()->whereKey($user->disabled_by)->value('name') : null,
            'is_staff_account' => $this->isStaffAccount($user),
            'is_member' => $user->isMember(),
            'direct_permissions' => $direct,
            'role_permissions' => $viaRoles,
            'effective_permissions' => $user->permissionNames(),
        ];
    }

    /**
     * Roles an admin can pick in the UI (member is excluded; super roles flagged). With an actor, each role says
     * whether that actor may grant it (UI hint only: UserAccessRules enforces the same rule on the server).
     */
    public function assignableRoles(?User $actor = null): array
    {
        $meta = RoleMeta::query()->get()->keyBy('role_id');
        $actorIsSuper = $actor?->isSuperAdmin() ?? false;
        $held = $actor && ! $actorIsSuper ? $actor->getAllPermissions()->pluck('name')->all() : [];

        return Role::query()->where('guard_name', 'web')->where('name', '!=', 'member')->with('permissions:id,name')->orderBy('id')->get()->map(function (Role $role) use ($meta, $actor, $actorIsSuper, $held) {
            $registry = PermissionRegistry::ROLES[$role->name] ?? null;
            /** @var RoleMeta|null $m */
            $m = $meta->get($role->id);
            $isSuper = PermissionRegistry::isSuperRole($role->name);
            $grantable = $actor === null || $actorIsSuper || (! $isSuper && array_diff($role->permissions->pluck('name')->all(), $held) === []);

            return [
                'slug' => $role->name,
                'name_ar' => $m?->name_ar ?? $registry['ar'] ?? $role->name,
                'name_en' => $m?->name_en ?? $registry['en'] ?? $role->name,
                'is_super' => $isSuper,
                'is_system' => $m?->is_system ?? ($registry !== null),
                'portal' => $registry['portal'] ?? 'admin',
                'grantable' => $grantable,
            ];
        })->values()->all();
    }

    /** Permission definitions grouped by module for the overrides picker (with a per-actor `grantable` hint). */
    public function permissionGroups(?User $actor = null): array
    {
        $actorIsSuper = $actor?->isSuperAdmin() ?? false;
        $held = $actor && ! $actorIsSuper ? $actor->getAllPermissions()->pluck('name')->flip()->all() : [];
        $out = [];
        foreach (PermissionRegistry::grouped() as $module => $permissions) {
            $out[] = ['module' => $module, 'label' => PermissionRegistry::moduleLabel($module), 'permissions' => collect($permissions)->map(fn ($d, $key) => [
                'key' => $key,
                'label' => $d['label'],
                'grantable' => $actor === null || $actorIsSuper || isset($held[$key]),
            ])->values()->all()];
        }

        return $out;
    }

    /** @return array<int, array<string, mixed>> */
    public function loginHistory(User $user, int $limit = 30): array
    {
        return SecurityEvent::query()->where('user_id', $user->id)->whereIn('event_type', self::LOGIN_EVENT_TYPES)
            ->orderByDesc('id')->limit($limit)->get()->map(fn (SecurityEvent $e) => $this->event($e))->all();
    }

    /** @return array<int, array<string, mixed>> */
    public function securityEvents(User $user, int $limit = 50): array
    {
        return SecurityEvent::query()->where('user_id', $user->id)->orderByDesc('id')->limit($limit)->get()->map(fn (SecurityEvent $e) => $this->event($e))->all();
    }

    private function event(SecurityEvent $event): array
    {
        return [
            'id' => $event->id,
            'type' => $event->event_type,
            'severity' => $event->severity,
            'ip_address' => $event->ip_address,
            'user_agent' => $event->user_agent,
            'meta' => $event->meta,
            'created_at' => $event->created_at?->toIso8601String(),
        ];
    }
}
