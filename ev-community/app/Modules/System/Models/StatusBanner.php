<?php

namespace App\Modules\System\Models;

use Database\Factories\System\StatusBannerFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Short notice shown at the top of the public site / member portal / partner portal (HandleInertiaRequests shares
 * the current ones). Admin-only configuration; managed at /admin/banners.
 *
 * @property int $id
 * @property string $level information|warning|major
 * @property string $message_ar
 * @property string $message_en
 * @property array<int, string> $targets public|member|partner
 * @property bool $is_active
 * @property Carbon|null $starts_at
 * @property Carbon|null $ends_at
 */
class StatusBanner extends Model
{
    /** @use HasFactory<StatusBannerFactory> */
    use HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['targets' => 'array', 'is_active' => 'bool', 'starts_at' => 'datetime', 'ends_at' => 'datetime'];
    }

    protected static function newFactory(): StatusBannerFactory
    {
        return StatusBannerFactory::new();
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
