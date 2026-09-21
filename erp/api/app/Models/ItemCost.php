<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ItemCost extends BaseModel
{
    protected $table = 'item_costs';

    protected function casts(): array
    {
        return [
            'qty_on_hand' => 'decimal:4',
            'avg_cost' => 'decimal:8',
            'total_value' => 'decimal:4',
            'last_purchase_cost' => 'decimal:8',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

}