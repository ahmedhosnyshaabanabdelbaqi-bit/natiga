<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OfflineGrant extends BaseModel
{
    protected $table = 'offline_grants';

    protected function casts(): array
    {
        return [
            'valid_from' => 'datetime',
            'valid_to' => 'datetime',
            'max_doc_value' => 'decimal:2',
            'max_daily_value' => 'decimal:2',
            'allow_credit_sales' => 'boolean',
        ];
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    public function rep(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

}