<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustodyHandover extends BaseModel
{
    protected $table = 'custody_handovers';

    protected function casts(): array
    {
        return [
            'handover_date' => 'date',
            'cash_amount' => 'decimal:2',
            'goods_value' => 'decimal:2',
        ];
    }

    public function fromUser(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function toUser(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

}