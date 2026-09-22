<?php

namespace App\Models;

use App\Modules\Members\Models\Membership;
use App\Modules\Rbac\Services\PermissionRegistry;
use App\Support\Concerns\HasPublicId;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;
use Laravel\Fortify\Contracts\PasskeyUser;
use Laravel\Fortify\PasskeyAuthenticatable;
use Laravel\Fortify\TwoFactorAuthenticatable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

/**
 * @property int $id
 * @property string $public_id
 * @property string $name
 * @property string $email
 * @property string|null $mobile
 * @property string $password
 * @property string $preferred_locale
 * @property string $timezone
 * @property string $status
 * @property Carbon|null $email_verified_at
 * @property Carbon|null $mobile_verified_at
 * @property Carbon|null $last_login_at
 * @property string|null $two_factor_secret
 * @property string|null $two_factor_recovery_codes
 * @property Carbon|null $two_factor_confirmed_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Membership|null $membership
 */
#[Fillable(['name', 'email', 'mobile', 'password', 'preferred_locale', 'timezone', 'status'])]
#[Hidden(['password', 'two_factor_secret', 'two_factor_recovery_codes', 'remember_token'])]
class User extends Authenticatable implements MustVerifyEmail, PasskeyUser
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasPublicId, HasRoles, Notifiable, PasskeyAuthenticatable, TwoFactorAuthenticatable;

    public const STATUS_ACTIVE = 'active';

    public const STATUS_DISABLED = 'disabled';

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'mobile_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password_changed_at' => 'datetime',
            'disabled_at' => 'datetime',
            'password' => 'hashed',
            'two_factor_confirmed_at' => 'datetime',
        ];
    }

    protected static function newFactory(): UserFactory
    {
        return UserFactory::new();
    }

    public function membership(): HasOne
    {
        return $this->hasOne(Membership::class);
    }

    public function isActive(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }

    public function isMember(): bool
    {
        return $this->membership()->exists();
    }

    public function isStaff(): bool
    {
        return $this->isSuperAdmin() || $this->checkPermissionTo('admin.access');
    }

    public function isPartnerUser(): bool
    {
        return $this->checkPermissionTo('partner.access');
    }

    public function isSuperAdmin(): bool
    {
        return $this->hasAnyRole(PermissionRegistry::SUPER_ROLES);
    }

    public function hasMfaEnabled(): bool
    {
        return $this->two_factor_secret !== null && $this->two_factor_confirmed_at !== null;
    }

    /**
     * MFA is mandatory for privileged roles/permissions (config ev.mfa_mandatory_*).
     */
    public function mfaIsMandatory(): bool
    {
        if ($this->hasAnyRole(config('ev.mfa_mandatory_roles', []))) {
            return true;
        }
        foreach (config('ev.mfa_mandatory_permissions', []) as $permission) {
            if ($this->checkPermissionTo($permission)) {
                return true;
            }
        }

        return false;
    }

    /** Permission names for the frontend (UI hints only; the server enforces). */
    public function permissionNames(): array
    {
        if ($this->isSuperAdmin()) {
            return array_keys(PermissionRegistry::permissions());
        }

        return $this->getAllPermissions()->pluck('name')->values()->all();
    }

    public function preferredLocale(): string
    {
        return $this->preferred_locale ?: config('ev.default_locale', 'ar');
    }

    public function routeNotificationForMail(): string
    {
        return $this->email;
    }
}
