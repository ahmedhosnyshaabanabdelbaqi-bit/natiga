<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Setting extends BaseModel
{
    protected $table = 'settings';

    protected function casts(): array
    {
        return [
            'value' => 'array',
        ];
    }

}