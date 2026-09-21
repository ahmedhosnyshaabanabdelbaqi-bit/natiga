<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Batch extends BaseModel
{
    protected $table = 'batches';

    protected function casts(): array
    {
        return ['mfg_date' => 'date', 'expiry_date' => 'date'];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function isExpired(?\DateTimeInterface $asOf = null): bool
    {
        return $this->expiry_date !== null
            && $this->expiry_date->lt($asOf ?? now());
    }

    public function daysToExpiry(?\DateTimeInterface $asOf = null): ?int
    {
        return $this->expiry_date?->diffInDays($asOf ?? now(), false) * -1;
    }
}
