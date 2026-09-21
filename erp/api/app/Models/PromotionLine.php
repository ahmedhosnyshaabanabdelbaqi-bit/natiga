<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PromotionLine extends \Illuminate\Database\Eloquent\Model
{
    protected $guarded = ['id'];

    protected $table = 'promotion_lines';

    protected function casts(): array
    {
        return [
            'min_qty' => 'decimal:4',
            'free_qty' => 'decimal:4',
            'discount_pct' => 'decimal:4',
        ];
    }

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function freeItem(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

}