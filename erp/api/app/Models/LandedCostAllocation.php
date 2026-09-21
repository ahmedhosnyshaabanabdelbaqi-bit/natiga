<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LandedCostAllocation extends \Illuminate\Database\Eloquent\Model
{
    protected $guarded = ['id'];

    protected $table = 'landed_cost_allocations';

    protected function casts(): array
    {
        return [
            'basis' => 'decimal:4',
            'amount' => 'decimal:4',
            'to_inventory' => 'decimal:4',
            'to_cogs' => 'decimal:4',
            'qty_remaining_base' => 'decimal:4',
        ];
    }

    public function landedCost(): BelongsTo
    {
        return $this->belongsTo(LandedCost::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function goodsReceiptLine(): BelongsTo
    {
        return $this->belongsTo(GoodsReceiptLine::class);
    }

}