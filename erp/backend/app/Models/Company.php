<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;


class Company extends Model
{
    protected $table = 'companies';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'settings' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function branches(): HasMany
    {
        return $this->hasMany(Branch::class, 'company_id');
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'company_id');
    }

    public function settings(): HasMany
    {
        return $this->hasMany(Setting::class, 'company_id');
    }
}
