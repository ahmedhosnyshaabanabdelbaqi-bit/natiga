<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DayClosingStockLine extends \Illuminate\Database\Eloquent\Model
{
    protected $guarded = ['id'];

    protected $table = 'day_closing_stock_lines';

    protected function casts(): array
    {
        return [
            'opening_qty' => 'decimal:4',
            'loaded_qty' => 'decimal:4',
            'transfer_in_qty' => 'decimal:4',
            'customer_return_qty' => 'decimal:4',
            'sold_qty' => 'decimal:4',
            'bonus_qty' => 'decimal:4',
            'returned_to_wh_qty' => 'decimal:4',
            'transfer_out_qty' => 'decimal:4',
            'damaged_qty' => 'decimal:4',
            'expected_qty' => 'decimal:4',
            'counted_qty' => 'decimal:4',
            'variance_qty' => 'decimal:4',
            'sellable_qty' => 'decimal:4',
            'reserved_qty' => 'decimal:4',
            'under_inspection_qty' => 'decimal:4',
            'unit_cost' => 'decimal:8',
        ];
    }

    public function dayClosing(): BelongsTo
    {
        return $this->belongsTo(DayClosing::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class);
    }

}