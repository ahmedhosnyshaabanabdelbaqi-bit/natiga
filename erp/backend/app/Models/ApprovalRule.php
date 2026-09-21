<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;


class ApprovalRule extends Model
{
    protected $table = 'approval_rules';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'conditions' => 'array',
            'is_active' => 'boolean',
            'require_different_approver' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }

    public function steps(): HasMany
    {
        return $this->hasMany(ApprovalRuleStep::class, 'approval_rule_id');
    }
}
