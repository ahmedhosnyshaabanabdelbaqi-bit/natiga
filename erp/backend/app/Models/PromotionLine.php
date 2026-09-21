<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;


class PromotionLine extends Model
{
    protected $table = 'promotion_lines';

    protected $guarded = [];

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class, 'promotion_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'item_id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ItemCategory::class, 'category_id');
    }

    public function buyUom(): BelongsTo
    {
        return $this->belongsTo(Uom::class, 'buy_uom_id');
    }

    public function freeItem(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'free_item_id');
    }

    public function freeUom(): BelongsTo
    {
        return $this->belongsTo(Uom::class, 'free_uom_id');
    }
}
