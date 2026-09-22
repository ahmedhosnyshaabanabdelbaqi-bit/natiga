<?php

namespace App\Modules\Notifications\Models;

use App\Models\User;
use App\Modules\Notifications\Models\Enums\NotificationChannel;
use App\Modules\Notifications\Services\NotificationPreferences;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Explicit member choice for one (category, channel) pair. Absent rows fall back to the defaults matrix
 * in {@see NotificationPreferences}.
 *
 * @property int $id
 * @property int $user_id
 * @property string $category
 * @property NotificationChannel $channel
 * @property bool $enabled
 */
class NotificationPreference extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['channel' => NotificationChannel::class, 'enabled' => 'bool'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
