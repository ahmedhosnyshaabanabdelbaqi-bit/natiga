<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;


class Visit extends Model
{
    protected $table = 'visits';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'visit_date' => 'date',
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
            'is_planned' => 'boolean',
            'gps_available' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }

    public function salesman(): BelongsTo
    {
        return $this->belongsTo(Salesman::class, 'salesman_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(VisitPlan::class, 'visit_plan_id');
    }
}
