<?php

namespace App\Modules\Notifications\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum NotificationChannel: string implements HasLabel
{
    use EnumOptions;

    case InApp = 'in_app';
    case Email = 'email';
    case Sms = 'sms';
    case WhatsApp = 'whatsapp';

    public function label(): string
    {
        return __('notifications.channels.'.$this->value);
    }

    /** Channels that a member may never switch off for transactional notifications. */
    public function isLockedForTransactional(): bool
    {
        return $this === self::InApp || $this === self::Email;
    }

    /** Channels delivered by an external provider that has to be configured. */
    public function requiresProvider(): bool
    {
        return $this !== self::InApp;
    }

    /** SMS / WhatsApp: paid, intrusive messaging channels that always require the member's recorded consent. */
    public function isMessaging(): bool
    {
        return $this === self::Sms || $this === self::WhatsApp;
    }

    /**
     * Whether a delivery on this channel needs a `consent_logs` consent (marketing_<channel>):
     * SMS/WhatsApp always; email only for non-transactional (marketing) notifications; in-app never.
     */
    public function requiresConsent(bool $transactional): bool
    {
        return $this->isMessaging() || ($this === self::Email && ! $transactional);
    }

    /** @return self[] */
    public static function messaging(): array
    {
        return [self::Sms, self::WhatsApp];
    }
}
