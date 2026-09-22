<?php

namespace App\Modules\Integrations\Models;

use Illuminate\Database\Eloquent\Model;

/** One row per bulk sync run (exchange rates, station imports...). */
class IntegrationSyncLog extends Model
{
    public $timestamps = false;

    protected $table = 'integration_sync_logs';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
            'records_processed' => 'int',
            'records_failed' => 'int',
        ];
    }
}
