<?php

namespace App\Modules\Integrations\Models;

use App\Modules\Integrations\Models\Enums\IntegrationEventStatus;
use Database\Factories\Integrations\IntegrationEventFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Append-only log of outbound calls / inbound callbacks (duration, status, sanitised meta).
 */
class IntegrationEvent extends Model
{
    /** @use HasFactory<IntegrationEventFactory> */
    use HasFactory;

    public const UPDATED_AT = null;

    protected $table = 'integration_events';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'meta' => 'array',
            'status' => IntegrationEventStatus::class,
            'duration_ms' => 'int',
            'created_at' => 'datetime',
        ];
    }

    protected static function newFactory(): IntegrationEventFactory
    {
        return IntegrationEventFactory::new();
    }
}
