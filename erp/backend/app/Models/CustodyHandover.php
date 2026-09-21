<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;


class CustodyHandover extends Model
{
    protected $table = 'custody_handovers';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'handover_date' => 'date',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }

    public function fromSalesman(): BelongsTo
    {
        return $this->belongsTo(Salesman::class, 'from_salesman_id');
    }

    public function toSalesman(): BelongsTo
    {
        return $this->belongsTo(Salesman::class, 'to_salesman_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'warehouse_id');
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
