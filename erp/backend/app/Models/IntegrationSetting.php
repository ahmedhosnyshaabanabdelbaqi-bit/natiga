<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;


class IntegrationSetting extends Model
{
    protected $table = 'integration_settings';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'config' => 'array',
            'secret_env_keys' => 'array',
            'is_enabled' => 'boolean',
            'is_configured' => 'boolean',
            'last_health_check_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }
}
