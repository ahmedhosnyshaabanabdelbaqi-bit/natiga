<?php

namespace App\Support\Qr\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Server-side payload of an opaque QR token (see App\Support\Qr\QrService).
 *
 * @property int $id
 * @property string $token_id
 * @property string $purpose
 * @property array<string, mixed> $payload
 * @property Carbon|null $expires_at
 * @property bool $single_use
 * @property Carbon|null $used_at
 * @property int|null $used_by
 * @property Carbon $created_at
 */
class QrToken extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'qr_tokens';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'expires_at' => 'datetime',
            'single_use' => 'bool',
            'used_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'used_by');
    }

    public function scopeExpired(Builder $query): Builder
    {
        return $query->whereNotNull('expires_at')->where('expires_at', '<', now());
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }
}
