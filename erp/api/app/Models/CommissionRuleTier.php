<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CommissionRuleTier extends \Illuminate\Database\Eloquent\Model
{
    protected $guarded = ['id'];

    protected $table = 'commission_rule_tiers';

    protected function casts(): array
    {
        return [
            'from_value' => 'decimal:2',
            'to_value' => 'decimal:2',
            'percent' => 'decimal:4',
            'fixed_amount' => 'decimal:2',
        ];
    }

    public function rule(): BelongsTo
    {
        return $this->belongsTo(CommissionRule::class, 'commission_rule_id');
    }

}