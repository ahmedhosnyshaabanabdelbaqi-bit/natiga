<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CommissionRule extends BaseModel
{
    protected $table = 'commission_rules';

    protected function casts(): array
    {
        return [
            'conditions' => 'array',
            'valid_from' => 'date',
            'valid_to' => 'date',
            'is_active' => 'boolean',
            'split_pct' => 'decimal:4',
        ];
    }

    public function tiers(): HasMany
    {
        return $this->hasMany(CommissionRuleTier::class, 'commission_rule_id');
    }

}