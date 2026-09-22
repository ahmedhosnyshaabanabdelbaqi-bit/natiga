<?php

declare(strict_types=1);

namespace App\Modules\Core\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 */
class Terminal extends Model
{
    protected $table = 'terminals';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'offline_allowed' => 'boolean',
            'is_active' => 'boolean',
            'last_seen_at' => 'datetime',
            'offline_authorized_until' => 'datetime',
            'settings' => 'array',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'branch_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'warehouse_id');
    }
}
