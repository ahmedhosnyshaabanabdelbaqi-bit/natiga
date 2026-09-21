<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;


class Uom extends Model
{
    protected $table = 'uoms';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'allow_fraction' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }
}
