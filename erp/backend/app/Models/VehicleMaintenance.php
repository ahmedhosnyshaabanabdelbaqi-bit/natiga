<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;


class VehicleMaintenance extends Model
{
    protected $table = 'vehicle_maintenance';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'service_date' => 'date',
            'next_due_date' => 'date',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }
}
