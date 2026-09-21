<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Target extends BaseModel
{
    protected $table = 'targets';

    protected function casts(): array
    {
        return [
            'period_from' => 'date',
            'period_to' => 'date',
            'target_value' => 'decimal:2',
            'scope' => 'array',
        ];
    }

}