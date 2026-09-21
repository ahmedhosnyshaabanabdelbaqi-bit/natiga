<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Vehicle extends BaseModel
{
    protected $table = 'vehicles';

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'license_expiry' => 'date',
            'next_service_date' => 'date',
            'capacity_weight' => 'decimal:4',
            'capacity_volume' => 'decimal:4',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

}