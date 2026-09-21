<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccountMapping extends BaseModel
{
    protected $table = 'account_mappings';

    protected function casts(): array
    {
        return [
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

}