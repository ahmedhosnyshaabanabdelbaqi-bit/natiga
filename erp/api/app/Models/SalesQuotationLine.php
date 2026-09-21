<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalesQuotationLine extends \Illuminate\Database\Eloquent\Model
{
    protected $guarded = ['id'];

    protected $table = 'sales_quotation_lines';

    protected function casts(): array
    {
        return [
            'qty_input' => 'decimal:4',
            'qty_base' => 'decimal:4',
            'unit_price' => 'decimal:4',
            'line_total' => 'decimal:2',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function itemUnit(): BelongsTo
    {
        return $this->belongsTo(ItemUnit::class);
    }

}