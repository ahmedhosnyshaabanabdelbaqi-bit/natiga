<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BankReconciliationLine extends \Illuminate\Database\Eloquent\Model
{
    protected $guarded = ['id'];

    protected $table = 'bank_reconciliation_lines';

    protected function casts(): array
    {
        return [
            'value_date' => 'date',
            'amount' => 'decimal:2',
            'is_matched' => 'boolean',
        ];
    }

}