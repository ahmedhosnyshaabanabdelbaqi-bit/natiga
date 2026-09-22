<?php

declare(strict_types=1);

namespace App\Modules\Sync\Models;

use App\Modules\Core\Models\Terminal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 */
class DeviceSyncState extends Model
{
    protected $table = 'device_sync_states';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'last_pull_at' => 'datetime',
            'last_push_at' => 'datetime',
        ];
    }

    public function terminal(): BelongsTo
    {
        return $this->belongsTo(Terminal::class, 'terminal_id');
    }
}
