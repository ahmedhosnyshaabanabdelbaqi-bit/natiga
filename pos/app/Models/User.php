<?php

declare(strict_types=1);

namespace App\Models;

use App\Modules\Access\Models\Permission;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Models\UserLimit;
use App\Modules\Core\Models\Branch;
use App\Modules\Sales\Models\Sale;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name', 'username', 'email', 'password', 'pin_hash', 'is_active',
        'default_branch_id', 'locale', 'phone',
    ];

    protected $hidden = ['password', 'pin_hash', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'last_login_at' => 'datetime',
            'locked_until' => 'datetime',
        ];
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_user', 'user_id', 'role_id')
            ->withPivot('branch_id')
            ->withTimestamps();
    }

    /** Per-user grant/deny overrides layered on top of role permissions. */
    public function permissionOverrides(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'permission_user', 'user_id', 'permission_id')
            ->withPivot(['granted', 'branch_id'])
            ->withTimestamps();
    }

    public function limits(): HasOne
    {
        return $this->hasOne(UserLimit::class, 'user_id');
    }

    public function defaultBranch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'default_branch_id');
    }

    /** Branches this user may operate in; empty pivot branch_id = all branches. */
    public function accessibleBranchIds(): array
    {
        $this->loadMissing('roles');

        $ids = [];
        foreach ($this->roles as $role) {
            $branchId = $role->pivot->branch_id;
            if ($branchId === null) {
                return []; // unrestricted
            }
            $ids[] = (int) $branchId;
        }

        return array_values(array_unique($ids));
    }

    public function hasRole(string $code): bool
    {
        return $this->roles->contains(fn (Role $r) => $r->code === $code);
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class, 'user_id');
    }
}
