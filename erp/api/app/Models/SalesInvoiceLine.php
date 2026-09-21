<?php

namespace App\Models;

use App\Domain\Support\Num;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesInvoiceLine extends Model
{
    protected $guarded = ['id'];

    protected $table = 'sales_invoice_lines';

    protected function casts(): array
    {
        return [
            'unit_factor' => 'decimal:6',
            'qty_input' => 'decimal:4',
            'qty_base' => 'decimal:4',
            'qty_returned_base' => 'decimal:4',
            'unit_price' => 'decimal:4',
            'discount_pct' => 'decimal:4',
            'discount_amount' => 'decimal:2',
            'tax_rate' => 'decimal:4',
            'tax_amount' => 'decimal:2',
            'line_total' => 'decimal:2',
            'unit_cost' => 'decimal:8',
            'cogs_amount' => 'decimal:4',
            'is_bonus' => 'boolean',
        ];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(SalesInvoice::class, 'sales_invoice_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class);
    }

    /** How much of this line can still be returned. */
    public function returnableQtyBase(): string
    {
        return Num::sub($this->qty_base, $this->qty_returned_base, Num::QTY_SCALE);
    }
}
