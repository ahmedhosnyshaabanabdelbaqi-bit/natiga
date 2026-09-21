<?php

namespace App\Models;

use App\Domain\Support\Num;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Receipt extends BaseModel
{
    protected $table = 'receipts';

    protected function casts(): array
    {
        return [
            'receipt_date' => 'date',
            'posted_at' => 'datetime',
            'amount' => 'decimal:2',
            'allocated_amount' => 'decimal:2',
        ];
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(ReceiptAllocation::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function rep(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rep_id');
    }

    public function cheque(): BelongsTo
    {
        return $this->belongsTo(Cheque::class);
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class);
    }

    /** Money received but not yet applied to a specific invoice. */
    public function unallocatedAmount(): string
    {
        return Num::sub($this->amount, $this->allocated_amount, Num::MONEY_SCALE);
    }

    /** Only physical cash held by a rep counts toward their cash custody. */
    public function affectsRepCashCustody(): bool
    {
        return $this->method === 'cash' && $this->destination === 'custody';
    }
}
