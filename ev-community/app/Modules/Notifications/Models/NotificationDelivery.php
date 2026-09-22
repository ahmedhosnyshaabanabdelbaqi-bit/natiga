<?php

namespace App\Modules\Notifications\Models;

use App\Modules\Notifications\Models\Enums\DeliveryStatus;
use App\Modules\Notifications\Models\Enums\NotificationChannel;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Per-channel delivery record of a notification (status tracking + retry bookkeeping).
 *
 * @property int $id
 * @property int $notification_id
 * @property NotificationChannel $channel
 * @property DeliveryStatus $status
 * @property string|null $provider
 * @property string|null $provider_message_id
 * @property string|null $error
 * @property int $attempts
 * @property Carbon|null $queued_at
 * @property Carbon|null $sent_at
 * @property Carbon|null $delivered_at
 * @property-read Notification $notification
 */
class NotificationDelivery extends Model
{
    public const SKIP_NOT_CONFIGURED = 'not_configured';

    public const SKIP_PREFERENCE_DISABLED = 'preference_disabled';

    public const SKIP_NO_CONSENT = 'no_consent';

    public const SKIP_NO_EMAIL = 'no_email';

    public const SKIP_NO_MOBILE = 'no_mobile';

    /** The provider is a development `log` driver: the message was written to the log, never delivered. */
    public const SKIP_LOGGED_ONLY = 'logged_only';

    /** @return string[] */
    public static function skipReasons(): array
    {
        return [self::SKIP_NOT_CONFIGURED, self::SKIP_PREFERENCE_DISABLED, self::SKIP_NO_CONSENT, self::SKIP_NO_EMAIL, self::SKIP_NO_MOBILE, self::SKIP_LOGGED_ONLY];
    }

    /** Translated explanation of `error` for skipped deliveries (raw provider error for failed ones). */
    public function reasonLabel(): ?string
    {
        if ($this->error === null || $this->error === '') {
            return null;
        }

        return in_array($this->error, self::skipReasons(), true) ? __('notifications.skip_reasons.'.$this->error) : $this->error;
    }

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'channel' => NotificationChannel::class,
            'status' => DeliveryStatus::class,
            'attempts' => 'int',
            'queued_at' => 'datetime',
            'sent_at' => 'datetime',
            'delivered_at' => 'datetime',
        ];
    }

    public function notification(): BelongsTo
    {
        return $this->belongsTo(Notification::class);
    }

    public function markSent(?string $provider = null, ?string $providerMessageId = null): void
    {
        $this->forceFill([
            'status' => DeliveryStatus::Sent,
            'provider' => $provider ?? $this->provider,
            'provider_message_id' => $providerMessageId ?? $this->provider_message_id,
            'error' => null,
            'sent_at' => now(),
        ])->save();
    }

    public function markFailed(string $error): void
    {
        $this->forceFill(['status' => DeliveryStatus::Failed, 'error' => mb_substr($error, 0, 2000)])->save();
    }

    public function markSkipped(string $reason): void
    {
        $this->forceFill(['status' => DeliveryStatus::Skipped, 'error' => $reason])->save();
    }
}
