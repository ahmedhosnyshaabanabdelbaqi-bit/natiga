<?php

namespace App\Models;

use App\Domain\Support\Num;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalesInvoice extends BaseModel
{
    protected $table = 'sales_invoices';

    protected function casts(): array
    {
        return [
            'invoice_date' => 'date',
            'due_date' => 'date',
            'posted_at' => 'datetime',
            'moves_stock' => 'boolean',
            'subtotal' => 'decimal:2',
            'line_discount_amount' => 'decimal:2',
            'doc_discount_amount' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'delivery_fee' => 'decimal:2',
            'total' => 'decimal:2',
            'paid_amount' => 'decimal:2',
            'returned_amount' => 'decimal:2',
            'cogs_amount' => 'decimal:2',
            'e_invoice_response' => 'array',
        ];
    }

    public function lines(): HasMany
    {
        return $this->hasMany(SalesInvoiceLine::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function rep(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rep_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(SalesOrder::class, 'sales_order_id');
    }

    public function deliveryNote(): BelongsTo
    {
        return $this->belongsTo(DeliveryNote::class);
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class);
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(ReceiptAllocation::class);
    }

    /** What the customer still owes on this invoice, net of returns. */
    public function outstandingAmount(): string
    {
        return Num::sub(
            Num::sub($this->total, $this->paid_amount, Num::MONEY_SCALE),
            $this->returned_amount,
            Num::MONEY_SCALE
        );
    }

    public function grossProfit(): string
    {
        return Num::sub(
            Num::sub($this->total, $this->tax_amount, Num::MONEY_SCALE),
            $this->cogs_amount,
            Num::MONEY_SCALE
        );
    }
}
