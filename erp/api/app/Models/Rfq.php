<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Rfq extends BaseModel
{
    protected $table = 'rfqs';

    protected function casts(): array
    {
        return [
            'rfq_date' => 'date',
            'due_date' => 'date',
        ];
    }

    public function lines(): HasMany
    {
        return $this->hasMany(RfqLine::class, 'rfq_id');
    }

    public function quotes(): HasMany
    {
        return $this->hasMany(RfqQuote::class, 'rfq_id');
    }

}