<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Collection;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use BelongsToCompany, HasApiTokens, HasFactory, Notifiable;

    protected $guarded = ['id'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'is_super_admin' => 'boolean',
            'must_change_password' => 'boolean',
        ];
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class);
    }

    public function scopes(): HasMany
    {
        return $this->hasMany(UserScope::class);
    }

    public function devices(): HasMany
    {
        return $this->hasMany(Device::class);
    }

    /** Permission codes granted through any of the user's roles, memoised per request. */
    public function permissionCodes(): Collection
    {
        return once(fn () => $this->is_super_admin
            ? Permission::query()->pluck('code')
            : Permission::query()
                ->join('permission_role', 'permission_role.permission_id', '=', 'permissions.id')
                ->join('role_user', 'role_user.role_id', '=', 'permission_role.role_id')
                ->where('role_user.user_id', $this->id)
                ->distinct()
                ->pluck('permissions.code'));
    }

    public function hasPermission(string $code): bool
    {
        if (! $this->is_active) {
            return false;
        }

        return $this->is_super_admin || $this->permissionCodes()->contains($code);
    }

    public function hasAnyPermission(string ...$codes): bool
    {
        foreach ($codes as $code) {
            if ($this->hasPermission($code)) {
                return true;
            }
        }

        return false;
    }

    /**
     * IDs the user may touch for a scope type, or null meaning "no restriction".
     *
     * An empty scope list is deliberately read as unrestricted-within-company:
     * restriction is opt-in per user, configured by an administrator.
     */
    public function scopeIds(string $scopeType): ?array
    {
        if ($this->is_super_admin) {
            return null;
        }

        $ids = once(fn () => $this->scopes()->get()->groupBy('scope_type')
            ->map(fn ($rows) => $rows->pluck('scope_id')->all()));

        return $ids[$scopeType] ?? null;
    }

    public function canReachScope(string $scopeType, ?int $id): bool
    {
        if ($id === null) {
            return true;
        }
        $allowed = $this->scopeIds($scopeType);

        return $allowed === null || in_array($id, $allowed, true);
    }

    /** Customers this user is currently assigned to as a rep. */
    public function assignedCustomerIds(): array
    {
        return once(fn () => CustomerAssignment::query()
            ->where('rep_id', $this->id)
            ->whereNull('to_date')
            ->pluck('customer_id')
            ->all());
    }
}
