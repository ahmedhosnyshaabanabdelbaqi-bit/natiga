<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;


class CashDeposit extends Model
{
    protected $table = 'cash_deposits';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'deposit_date' => 'date',
            'posted_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'branch_id');
    }

    public function salesman(): BelongsTo
    {
        return $this->belongsTo(Salesman::class, 'salesman_id');
    }

    public function fromCashBox(): BelongsTo
    {
        return $this->belongsTo(CashBox::class, 'from_cash_box_id');
    }

    public function toCashBox(): BelongsTo
    {
        return $this->belongsTo(CashBox::class, 'to_cash_box_id');
    }

    public function toBankAccount(): BelongsTo
    {
        return $this->belongsTo(BankAccount::class, 'to_bank_account_id');
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'journal_entry_id');
    }

    public function dayClosure(): BelongsTo
    {
        return $this->belongsTo(DayClosure::class, 'day_closure_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
