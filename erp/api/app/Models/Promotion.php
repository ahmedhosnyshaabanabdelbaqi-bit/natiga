<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Promotion extends BaseModel
{
    protected $table = 'promotions';

    protected function casts(): array
    {
        return [
            'conditions' => 'array',
            'stackable' => 'boolean',
            'is_active' => 'boolean',
            'valid_from' => 'date',
            'valid_to' => 'date',
        ];
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PromotionLine::class, 'promotion_id');
    }

}