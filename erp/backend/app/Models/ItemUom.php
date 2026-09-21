<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;


class ItemUom extends Model
{
    protected $table = 'item_uoms';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'is_base' => 'boolean',
            'is_sales_default' => 'boolean',
            'is_purchase_default' => 'boolean',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'item_id');
    }

    public function uom(): BelongsTo
    {
        return $this->belongsTo(Uom::class, 'uom_id');
    }
}
