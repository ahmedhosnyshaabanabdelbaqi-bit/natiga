<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;


class VisitPlanLine extends Model
{
    protected $table = 'visit_plan_lines';

    protected $guarded = [];

    public function plan(): BelongsTo
    {
        return $this->belongsTo(VisitPlan::class, 'visit_plan_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }
}
