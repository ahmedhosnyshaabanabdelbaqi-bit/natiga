<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;


class Promotion extends Model
{
    protected $table = 'promotions';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'valid_from' => 'date',
            'valid_to' => 'date',
            'stackable' => 'boolean',
            'is_active' => 'boolean',
            'conditions' => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PromotionLine::class, 'promotion_id');
    }
}
