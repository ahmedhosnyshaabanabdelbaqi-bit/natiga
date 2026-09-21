<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;


class Cheque extends Model
{
    protected $table = 'cheques';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'issue_date' => 'date',
            'due_date' => 'date',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }

    public function bankAccount(): BelongsTo
    {
        return $this->belongsTo(BankAccount::class, 'bank_account_id');
    }

    public function events(): HasMany
    {
        return $this->hasMany(ChequeEvent::class, 'cheque_id');
    }
}
