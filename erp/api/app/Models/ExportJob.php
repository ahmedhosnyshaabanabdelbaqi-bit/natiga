<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ExportJob extends BaseModel
{
    protected $table = 'export_jobs';

    protected function casts(): array
    {
        return [
            'params' => 'array',
            'expires_at' => 'datetime',
        ];
    }

}