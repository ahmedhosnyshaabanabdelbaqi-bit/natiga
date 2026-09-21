<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockTransferLine extends \Illuminate\Database\Eloquent\Model
{
    protected $guarded = ['id'];

    protected $table = 'stock_transfer_lines';

    protected function casts(): array
    {
        return [
            'qty_input' => 'decimal:4',
            'qty_base' => 'decimal:4',
            'qty_received_base' => 'decimal:4',
            'qty_shortage_base' => 'decimal:4',
            'unit_cost' => 'decimal:8',
            'unit_factor' => 'decimal:6',
        ];
    }

    public function transfer(): BelongsTo
    {
        return $this->belongsTo(StockTransfer::class, 'stock_transfer_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class);
    }

    public function itemUnit(): BelongsTo
    {
        return $this->belongsTo(ItemUnit::class);
    }

}