<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;


class SupplierQuoteLine extends Model
{
    protected $table = 'supplier_quote_lines';

    protected $guarded = [];

    public function quote(): BelongsTo
    {
        return $this->belongsTo(SupplierQuote::class, 'supplier_quote_id');
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
