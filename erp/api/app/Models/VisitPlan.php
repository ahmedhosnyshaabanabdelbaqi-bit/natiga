<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VisitPlan extends BaseModel
{
    protected $table = 'visit_plans';

    protected function casts(): array
    {
        return [
            'plan_date' => 'date',
        ];
    }

    public function rep(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function route(): BelongsTo
    {
        return $this->belongsTo(Route::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(VisitPlanLine::class, 'visit_plan_id');
    }

}