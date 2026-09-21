<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PriceList extends BaseModel
{
    protected $table = 'price_lists';

    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'is_active' => 'boolean',
            'prices_include_tax' => 'boolean',
            'valid_from' => 'date',
            'valid_to' => 'date',
        ];
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PriceListLine::class, 'price_list_id');
    }

}