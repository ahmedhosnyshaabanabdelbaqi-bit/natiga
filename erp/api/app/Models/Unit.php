<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Unit extends BaseModel
{
    protected $table = 'units';

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

}