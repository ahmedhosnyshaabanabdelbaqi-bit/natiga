<?php

namespace App\Models;

use App\Domain\Support\Num;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockBalance extends BaseModel
{
    protected $table = 'stock_balances';

    protected function casts(): array
    {
        return ['qty_on_hand' => 'decimal:4', 'qty_reserved' => 'decimal:4'];
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

    /** On hand minus what is already promised to a document. */
    public function getQtyAvailableAttribute(): string
    {
        return Num::sub($this->qty_on_hand, $this->qty_reserved, Num::QTY_SCALE);
    }
}
