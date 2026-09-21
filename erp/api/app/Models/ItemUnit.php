<?php

namespace App\Models;

use App\Domain\Support\Num;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ItemUnit extends Model
{
    protected $guarded = ['id'];

    protected $table = 'item_units';

    protected function casts(): array
    {
        return [
            'factor' => 'decimal:6',
            'sale_price' => 'decimal:4',
            'is_base' => 'boolean',
            'is_sales_default' => 'boolean',
            'is_purchase_default' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }

    /** Convert a quantity expressed in this unit into base units. */
    public function toBase(string|float $qty): string
    {
        return Num::mul($qty, $this->factor, Num::QTY_SCALE);
    }
}
