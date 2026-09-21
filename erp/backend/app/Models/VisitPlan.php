<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;


class VisitPlan extends Model
{
    protected $table = 'visit_plans';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'plan_date' => 'date',
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

    public function route(): BelongsTo
    {
        return $this->belongsTo(Route::class, 'route_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(VisitPlanLine::class, 'visit_plan_id');
    }
}
