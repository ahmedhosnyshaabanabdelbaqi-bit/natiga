<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $guarded = [];

    protected $hidden = ['password', 'remember_token', 'mfa_secret'];

    /** @var array<string, mixed>|null */
    private ?array $permissionCache = null;

    /** @var array<string, array<int, int>>|null */
    private ?array $scopeCache = null;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'is_super_admin' => 'boolean',
            'must_change_password' => 'boolean',
            'mfa_enabled' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_user');
    }

    public function scopes(): HasMany
    {
        return $this->hasMany(UserScope::class);
    }

    public function salesman(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(Salesman::class);
    }

    /**
     * كل أكواد الصلاحيات الفعلية للمستخدم (من كل أدواره).
     *
     * @return array<string, bool>
     */
    public function permissionCodes(): array
    {
        if ($this->permissionCache !== null) {
            return $this->permissionCache;
        }

        $codes = Permission::query()
            ->join('permission_role', 'permission_role.permission_id', '=', 'permissions.id')
            ->join('role_user', 'role_user.role_id', '=', 'permission_role.role_id')
            ->where('role_user.user_id', $this->id)
            ->distinct()
            ->pluck('permissions.code')
            ->all();

        return $this->permissionCache = array_fill_keys($codes, true);
    }

    /**
     * الرفض الافتراضي: بدون إذن صريح لا يُسمح بالعملية.
     * مالك النظام فقط هو الاستثناء.
     */
    public function hasPermission(string $code): bool
    {
        if (! $this->is_active) {
            return false;
        }
        if ($this->is_super_admin) {
            return true;
        }

        $codes = $this->permissionCodes();

        if (isset($codes[$code])) {
            return true;
        }

        // دعم البدائل: sales.invoice.* يمنح كل أذونات المجموعة
        $parts = explode('.', $code);
        while (count($parts) > 1) {
            array_pop($parts);
            if (isset($codes[implode('.', $parts).'.*'])) {
                return true;
            }
        }

        return false;
    }

    /** @param  array<int, string>  $codes */
    public function hasAnyPermission(array $codes): bool
    {
        foreach ($codes as $code) {
            if ($this->hasPermission($code)) {
                return true;
            }
        }

        return false;
    }

    /** @return array<int, int> */
    public function scopeIds(string $scopeType): array
    {
        if ($this->scopeCache === null) {
            $this->scopeCache = [];
            foreach ($this->scopes()->get() as $scope) {
                $this->scopeCache[$scope->scope_type][] = (int) $scope->scope_id;
            }
        }

        return $this->scopeCache[$scopeType] ?? [];
    }

    /**
     * هل يملك المستخدم وصولًا لهذا السجل ضمن نطاقه؟
     * غياب أي نطاق مُسجَّل = وصول غير مقيّد بهذا البعد (يُقيَّد بالأذونات وحدها).
     */
    public function withinScope(string $scopeType, ?int $scopeId): bool
    {
        if ($this->is_super_admin) {
            return true;
        }
        if ($scopeId === null) {
            return true;
        }
        $allowed = $this->scopeIds($scopeType);
        if ($allowed === []) {
            return true;
        }

        return in_array($scopeId, $allowed, true);
    }

    public function isSalesman(): bool
    {
        return $this->salesman()->exists();
    }

    public function salesmanId(): ?int
    {
        return $this->salesman()->value('id');
    }

    /** إخفاء التكلفة والربح عن غير المخوّلين. */
    public function canSeeCost(): bool
    {
        return $this->hasPermission('reports.cost.view');
    }
}
