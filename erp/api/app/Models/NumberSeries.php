<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class NumberSeries extends BaseModel
{
    protected $table = 'number_series';

    protected function casts(): array
    {
        return [
        ];
    }

}