<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CreditReservation extends BaseModel
{
    protected $table = 'credit_reservations';

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'consumed_amount' => 'decimal:2',
            'expires_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
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