<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RepLocation extends BaseModel
{
    protected $table = 'rep_locations';

    protected function casts(): array
    {
        return [
            'recorded_at' => 'datetime',
            'shift_active' => 'boolean',
            'retention_until' => 'date',
            'created_at' => 'datetime',
        ];
    }

    public function rep(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

}