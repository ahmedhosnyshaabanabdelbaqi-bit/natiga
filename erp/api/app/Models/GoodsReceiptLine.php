<?php

namespace App\Models;

use App\Domain\Support\Num;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GoodsReceiptLine extends Model
{
    protected $guarded = ['id'];

    protected $table = 'goods_receipt_lines';

    protected function casts(): array
    {
        return [
            'unit_factor' => 'decimal:6',
            'qty_input' => 'decimal:4',
            'qty_base' => 'decimal:4',
            'qty_invoiced_base' => 'decimal:4',
            'unit_cost' => 'decimal:8',
            'landed_cost_value' => 'decimal:4',
            'value' => 'decimal:4',
        ];
    }

    public function receipt(): BelongsTo
    {
        return $this->belongsTo(GoodsReceipt::class, 'goods_receipt_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class);
    }

    public function purchaseOrderLine(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrderLine::class);
    }

    /** Received but not yet matched to a supplier invoice — the GRNI balance. */
    public function uninvoicedQtyBase(): string
    {
        return Num::sub($this->qty_base, $this->qty_invoiced_base, Num::QTY_SCALE);
    }
}
