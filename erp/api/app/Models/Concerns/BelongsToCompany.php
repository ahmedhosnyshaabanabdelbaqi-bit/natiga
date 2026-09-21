<?php

namespace App\Models\Concerns;

use App\Models\Company;
use App\Support\CompanyContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Scopes every query to the active company and stamps company_id on create.
 *
 * The scope is applied globally rather than left to each query, so forgetting a
 * where clause cannot leak another company's rows. Cross-company work has to
 * opt out explicitly via withoutCompanyScope().
 */
trait BelongsToCompany
{
    public static function bootBelongsToCompany(): void
    {
        static::addGlobalScope('company', function (Builder $query) {
            if ($companyId = CompanyContext::id()) {
                $query->where($query->getModel()->getTable().'.company_id', $companyId);
            }
        });

        static::creating(function ($model) {
            if (empty($model->company_id) && ($companyId = CompanyContext::id())) {
                $model->company_id = $companyId;
            }
        });
    }

    public function scopeWithoutCompanyScope(Builder $query): Builder
    {
        return $query->withoutGlobalScope('company');
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
