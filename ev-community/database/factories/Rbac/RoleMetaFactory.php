<?php

namespace Database\Factories\Rbac;

use App\Modules\Rbac\Models\RoleMeta;
use Illuminate\Database\Eloquent\Factories\Factory;
use Spatie\Permission\Models\Role;

/**
 * @extends Factory<RoleMeta>
 */
class RoleMetaFactory extends Factory
{
    protected $model = RoleMeta::class;

    public function definition(): array
    {
        return [
            'role_id' => fn () => Role::query()->create(['name' => 'custom-'.fake()->unique()->lexify('????'), 'guard_name' => 'web'])->id,
            'name_ar' => 'دور مخصص',
            'name_en' => 'Custom role',
            'description' => null,
            'is_system' => false,
        ];
    }
}
