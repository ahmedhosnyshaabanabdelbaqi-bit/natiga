<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ImportJob extends BaseModel
{
    protected $table = 'import_jobs';

    protected function casts(): array
    {
        return [
            'preview' => 'array',
        ];
    }

}