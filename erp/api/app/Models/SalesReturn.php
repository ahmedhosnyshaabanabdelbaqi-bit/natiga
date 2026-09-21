<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalesReturn extends BaseModel
{
    protected $table = 'sales_returns';

    protected function casts(): array
    {
        return [
            'return_date' => 'date',
            'received_at' => 'datetime',
            'posted_at' => 'datetime',
            'without_invoice' => 'boolean',
            'subtotal' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'total' => 'decimal:2',
            'cogs_amount' => 'decimal:2',
        ];
    }

    public function lines(): HasMany
    {
        return $this->hasMany(SalesReturnLine::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(SalesInvoice::class, 'sales_invoice_id');
    }

    public function receiptWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'receipt_warehouse_id');
    }
}
