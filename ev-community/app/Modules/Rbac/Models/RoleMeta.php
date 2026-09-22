<?php

namespace App\Modules\Rbac\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\Permission\Models\Role;

/**
 * Bilingual names/description for Spatie roles. `is_system` roles come from PermissionRegistry::ROLES
 * and cannot be deleted; custom roles are created by admins from the roles matrix page.
 *
 * @property int $id
 * @property int $role_id
 * @property string $name_ar
 * @property string $name_en
 * @property string|null $description
 * @property bool $is_system
 */
class RoleMeta extends Model
{
    protected $table = 'role_meta';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['is_system' => 'bool'];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function name(?string $locale = null): string
    {
        $locale ??= app()->getLocale();
        $value = $locale === 'ar' ? $this->name_ar : $this->name_en;

        return $value !== '' ? $value : ($locale === 'ar' ? $this->name_en : $this->name_ar);
    }
}
