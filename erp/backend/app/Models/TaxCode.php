<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;


class TaxCode extends Model
{
    protected $table = 'tax_codes';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'valid_from' => 'date',
            'valid_to' => 'date',
            'is_inclusive' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }

    public function outputAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'output_account_id');
    }

    public function inputAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'input_account_id');
    }
}
