<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;


class CommissionEntry extends Model
{
    protected $table = 'commission_entries';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'entry_date' => 'date',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }

    public function salesman(): BelongsTo
    {
        return $this->belongsTo(Salesman::class, 'salesman_id');
    }

    public function rule(): BelongsTo
    {
        return $this->belongsTo(CommissionRule::class, 'commission_rule_id');
    }

    public function settlement(): BelongsTo
    {
        return $this->belongsTo(CommissionSettlement::class, 'settlement_id');
    }
}
