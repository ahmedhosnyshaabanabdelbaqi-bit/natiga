<?php

namespace App\Modules\Notifications\Services;

use App\Modules\Notifications\Models\Enums\NotificationChannel;
use App\Modules\Notifications\Services\Channels\EmailChannel;
use App\Modules\Notifications\Services\Channels\SmsChannel;
use App\Modules\Notifications\Services\Channels\WhatsAppChannel;

/**
 * Which delivery channels can really deliver right now. The UI never shows a channel as working
 * unless this says so; the pipeline records `skipped:not_configured` otherwise.
 */
final class Channels
{
    public static function isConfigured(NotificationChannel|string $channel): bool
    {
        $channel = $channel instanceof NotificationChannel ? $channel : NotificationChannel::tryFrom($channel);

        return match ($channel) {
            NotificationChannel::InApp => true,
            NotificationChannel::Email => EmailChannel::isConfigured(),
            NotificationChannel::Sms => SmsChannel::isConfigured(),
            NotificationChannel::WhatsApp => WhatsAppChannel::isConfigured(),
            null => false,
        };
    }

    /** @return array<string, bool> channel value => configured */
    public static function statusMap(): array
    {
        $map = [];
        foreach (NotificationChannel::cases() as $channel) {
            $map[$channel->value] = self::isConfigured($channel);
        }

        return $map;
    }

    /** @return array<int, array{value: string, label: string, configured: bool, always: bool}> */
    public static function options(): array
    {
        return array_map(fn (NotificationChannel $channel) => [
            'value' => $channel->value,
            'label' => $channel->label(),
            'configured' => self::isConfigured($channel),
            'always' => $channel === NotificationChannel::InApp,
        ], NotificationChannel::cases());
    }
}
