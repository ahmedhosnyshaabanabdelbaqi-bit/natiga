<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockAdjustment extends BaseModel
{
    protected $table = 'stock_adjustments';

    protected function casts(): array
    {
        return [
            'adjustment_date' => 'date',
            'total_value' => 'decimal:2',
        ];
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(StockAdjustmentLine::class, 'stock_adjustment_id');
    }

}