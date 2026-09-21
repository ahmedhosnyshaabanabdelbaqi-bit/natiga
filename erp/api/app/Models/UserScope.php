<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class UserScope extends \Illuminate\Database\Eloquent\Model
{
    protected $guarded = ['id'];

    protected $table = 'user_scopes';

    protected function casts(): array
    {
        return [
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

}