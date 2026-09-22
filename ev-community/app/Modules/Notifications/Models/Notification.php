<?php

namespace App\Modules\Notifications\Models;

use App\Models\User;
use App\Modules\Notifications\Models\Enums\NotificationCategory;
use App\Support\Concerns\HasPublicId;
use Database\Factories\Notifications\NotificationFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * In-app notification (the primary channel). One row per user per event; deliveries track other channels.
 *
 * @property int $id
 * @property string $public_id
 * @property int $user_id
 * @property string $category
 * @property string $key
 * @property string $title
 * @property string $body
 * @property string|null $url
 * @property array<string, mixed>|null $data
 * @property bool $is_transactional
 * @property string|null $dedup_key
 * @property Carbon|null $read_at
 * @property Carbon $created_at
 * @property-read User $user
 */
class Notification extends Model
{
    /** @use HasFactory<NotificationFactory> */
    use HasFactory, HasPublicId;

    public const UPDATED_AT = null;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'data' => 'array',
            'is_transactional' => 'bool',
            'read_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    protected static function newFactory(): NotificationFactory
    {
        return NotificationFactory::new();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(NotificationDelivery::class);
    }

    public function scopeForUser(Builder $query, User $user): Builder
    {
        return $query->where('user_id', $user->id);
    }

    public function scopeUnread(Builder $query): Builder
    {
        return $query->whereNull('read_at');
    }

    public function scopeCategory(Builder $query, ?string $category): Builder
    {
        if ($category === null || $category === '' || NotificationCategory::tryFrom($category) === null) {
            return $query;
        }

        return $query->where('category', $category);
    }

    public function isRead(): bool
    {
        return $this->read_at !== null;
    }

    public function categoryEnum(): ?NotificationCategory
    {
        return NotificationCategory::tryFrom($this->category);
    }
}
