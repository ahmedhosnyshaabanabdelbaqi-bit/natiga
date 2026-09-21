<?php

namespace App\Models;

use App\Domain\Support\Num;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only. Nothing in the application updates or deletes a movement — a
 * correction is a new movement in the opposite direction.
 */
class StockMovement extends BaseModel
{
    protected $table = 'stock_movements';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'qty_base' => 'decimal:4',
            'unit_cost' => 'decimal:8',
            'value' => 'decimal:4',
            'balance_after' => 'decimal:4',
            'moved_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class);
    }

    /** Signed quantity, for running-balance style reports. */
    public function getSignedQtyAttribute(): string
    {
        return $this->direction === 'in'
            ? (string) $this->qty_base
            : Num::neg($this->qty_base, Num::QTY_SCALE);
    }
}
