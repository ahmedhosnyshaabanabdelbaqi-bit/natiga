<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockCount extends BaseModel
{
    protected $table = 'stock_counts';

    protected function casts(): array
    {
        return [
            'count_date' => 'date',
            'is_blind' => 'boolean',
            'freeze_movements' => 'boolean',
            'started_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(StockCountLine::class, 'stock_count_id');
    }

}