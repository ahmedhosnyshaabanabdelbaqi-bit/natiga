<?php

namespace App\Models;

use App\Domain\Support\Num;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesOrderLine extends Model
{
    protected $guarded = ['id'];

    protected $table = 'sales_order_lines';

    protected function casts(): array
    {
        return [
            'unit_factor' => 'decimal:6',
            'qty_input' => 'decimal:4',
            'qty_base' => 'decimal:4',
            'qty_reserved_base' => 'decimal:4',
            'qty_delivered_base' => 'decimal:4',
            'qty_invoiced_base' => 'decimal:4',
            'unit_price' => 'decimal:4',
            'discount_pct' => 'decimal:4',
            'discount_amount' => 'decimal:2',
            'tax_rate' => 'decimal:4',
            'tax_amount' => 'decimal:2',
            'line_total' => 'decimal:2',
            'is_bonus' => 'boolean',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(SalesOrder::class, 'sales_order_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function itemUnit(): BelongsTo
    {
        return $this->belongsTo(ItemUnit::class);
    }

    public function qtyOutstandingBase(): string
    {
        return Num::sub($this->qty_base, $this->qty_delivered_base, Num::QTY_SCALE);
    }
}
