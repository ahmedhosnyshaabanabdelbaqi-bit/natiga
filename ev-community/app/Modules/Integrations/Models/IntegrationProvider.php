<?php

namespace App\Modules\Integrations\Models;

use App\Modules\Integrations\Contracts\Data\HealthStatus;
use Illuminate\Database\Eloquent\Model;

/**
 * Last known health per integration category (one row per key). Written only by
 * `Integrations::check()`; `public_config` never contains secrets.
 *
 * @property string $key
 * @property string $driver
 * @property HealthStatus $status
 */
class IntegrationProvider extends Model
{
    protected $table = 'integration_providers';

    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'status' => HealthStatus::class,
            'public_config' => 'array',
            'last_checked_at' => 'datetime',
            'last_success_at' => 'datetime',
        ];
    }
}
