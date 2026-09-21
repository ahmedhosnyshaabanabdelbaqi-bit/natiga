<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;


class LandedCostAllocation extends Model
{
    protected $table = 'landed_cost_allocations';

    protected $guarded = [];

    public function landedCost(): BelongsTo
    {
        return $this->belongsTo(LandedCost::class, 'landed_cost_id');
    }

    public function receiptLine(): BelongsTo
    {
        return $this->belongsTo(GoodsReceiptLine::class, 'goods_receipt_line_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'item_id');
    }
}
