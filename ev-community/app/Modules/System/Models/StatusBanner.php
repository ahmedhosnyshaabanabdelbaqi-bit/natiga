<?php

namespace App\Modules\System\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class StatusBanner extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['targets' => 'array', 'is_active' => 'bool', 'starts_at' => 'datetime', 'ends_at' => 'datetime'];
    }

    public function scopeCurrent(Builder $query, string $target): Builder
    {
        return $query->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            ->whereJsonContains('targets', $target)
            ->orderByDesc('id');
    }
}
