<?php

namespace App\Modules\Notifications\Services;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Notifications\Models\Enums\NotificationCategory;
use App\Modules\Notifications\Models\Enums\NotificationChannel;
use App\Modules\Notifications\Models\NotificationPreference;
use App\Support\Exceptions\DomainException;
use Illuminate\Support\Facades\DB;

/**
 * Member preference matrix (category × channel) + per-channel consent.
 *
 *  - Transactional categories: in_app and email are locked ON (cannot be disabled); sms/whatsapp preferences
 *    default on but only deliver when the member recorded SMS/WhatsApp consent.
 *  - The pseudo-category `marketing` covers every non-transactional notification: in_app on by default,
 *    email/sms/whatsapp are opt-in (default off). Switching marketing email on records the marketing email consent.
 *  - SMS/WhatsApp consent is its own switch (`$consents`), shared with the Members privacy page (consent_logs).
 */
final class NotificationPreferences
{
    public const MARKETING = NotificationCategory::MARKETING;

    /** @return string[] every preference category (transactional categories + marketing) */
    public static function categories(): array
    {
        return array_merge(NotificationCategory::values(), [self::MARKETING]);
    }

    public static function isCategory(string $category): bool
    {
        return in_array($category, self::categories(), true);
    }

    public static function normaliseCategory(string $category): string
    {
        if ($category === self::MARKETING) {
            return $category;
        }

        return NotificationCategory::tryFrom($category)?->value ?? NotificationCategory::System->value;
    }

    public static function isLocked(string $category, NotificationChannel $channel): bool
    {
        return self::normaliseCategory($category) !== self::MARKETING && $channel->isLockedForTransactional();
    }

    public static function defaultFor(string $category, NotificationChannel $channel): bool
    {
        if (self::normaliseCategory($category) === self::MARKETING) {
            return $channel === NotificationChannel::InApp;
        }

        return true;
    }

    /** Whether the member's preference accepts this category on this channel (locked pairs are always true; consent is separate). */
    public static function allows(User $user, string $category, NotificationChannel|string $channel): bool
    {
        $channel = $channel instanceof NotificationChannel ? $channel : NotificationChannel::tryFrom($channel);
        if ($channel === null) {
            return false;
        }
        $category = self::normaliseCategory($category);
        if (self::isLocked($category, $channel)) {
            return true;
        }
        $row = NotificationPreference::query()
            ->where('user_id', $user->id)->where('category', $category)->where('channel', $channel->value)
            ->first(['enabled']);

        return $row ? $row->enabled : self::defaultFor($category, $channel);
    }

    /**
     * Everything the preferences page needs.
     *
     * @return array{
     *     channels: array<int, array{value: string, label: string, configured: bool, messaging: bool, consent: bool}>,
     *     categories: array<int, array{category: string, label: string, transactional: bool, channels: array<string, array{enabled: bool, locked: bool}>}>
     * }
     */
    public static function matrix(User $user): array
    {
        $rows = NotificationPreference::query()->where('user_id', $user->id)->get()
            ->keyBy(fn (NotificationPreference $p) => $p->category.'.'.$p->channel->value);
        $configured = Channels::statusMap();
        $consents = MarketingConsent::states($user);

        $channels = array_map(fn (NotificationChannel $channel) => [
            'value' => $channel->value,
            'label' => $channel->label(),
            'configured' => $configured[$channel->value],
            'messaging' => $channel->isMessaging(),
            'consent' => $channel->requiresProvider() ? ($consents[$channel->value] ?? false) : true,
        ], NotificationChannel::cases());

        $categories = [];
        foreach (self::categories() as $category) {
            $cells = [];
            foreach (NotificationChannel::cases() as $channel) {
                $row = $rows->get($category.'.'.$channel->value);
                $locked = self::isLocked($category, $channel);
                $cells[$channel->value] = [
                    'enabled' => $locked ? true : ($row ? $row->enabled : self::defaultFor($category, $channel)),
                    'locked' => $locked,
                ];
            }
            $categories[] = [
                'category' => $category,
                'label' => __('notifications.categories.'.$category),
                'transactional' => $category !== self::MARKETING,
                'channels' => $cells,
            ];
        }

        return ['channels' => $channels, 'categories' => $categories];
    }

    /**
     * Persist explicit choices atomically. `$choices` = [category => [channel => bool]], `$consents` = [sms|whatsapp => bool].
     * Locked pairs cannot be disabled (DomainException → 422, nothing is written). Unknown categories/channels are ignored.
     * Switching marketing email on/off records/withdraws the marketing email consent.
     *
     * @param  array<string, array<string, mixed>>  $choices
     * @param  array<string, mixed>  $consents
     * @return array<string, array{old: bool, new: bool}> changed pairs keyed "category.channel" / "consent.channel"
     */
    public static function update(User $user, array $choices, ?User $actor = null, array $consents = []): array
    {
        $changes = [];
        DB::transaction(function () use ($user, $choices, $consents, &$changes) {
            // Validate everything first: a rejected pair must not leave half-applied preferences.
            foreach ($choices as $category => $channels) {
                if (! is_string($category) || ! self::isCategory($category) || ! is_array($channels)) {
                    continue;
                }
                foreach ($channels as $channelValue => $enabled) {
                    $channel = NotificationChannel::tryFrom((string) $channelValue);
                    if ($channel !== null && self::isLocked($category, $channel) && ! filter_var($enabled, FILTER_VALIDATE_BOOL)) {
                        throw DomainException::because('notifications.errors.cannot_disable_transactional', [], "preferences.{$category}.{$channel->value}");
                    }
                }
            }

            foreach ($choices as $category => $channels) {
                if (! is_string($category) || ! self::isCategory($category) || ! is_array($channels)) {
                    continue;
                }
                foreach ($channels as $channelValue => $enabled) {
                    $channel = NotificationChannel::tryFrom((string) $channelValue);
                    if ($channel === null || self::isLocked($category, $channel)) {
                        continue;
                    }
                    $enabled = filter_var($enabled, FILTER_VALIDATE_BOOL);
                    $current = self::allows($user, $category, $channel);
                    if ($current !== $enabled) {
                        $changes["{$category}.{$channel->value}"] = ['old' => $current, 'new' => $enabled];
                    }
                    NotificationPreference::query()->updateOrCreate(
                        ['user_id' => $user->id, 'category' => $category, 'channel' => $channel->value],
                        ['enabled' => $enabled],
                    );
                    if ($category === self::MARKETING && $channel === NotificationChannel::Email) {
                        $written = $enabled ? MarketingConsent::grant($user, $channel) : MarketingConsent::withdraw($user, $channel);
                        if ($written) {
                            $changes['consent.email'] = ['old' => ! $enabled, 'new' => $enabled];
                        }
                    }
                }
            }

            foreach (NotificationChannel::messaging() as $channel) {
                if (! array_key_exists($channel->value, $consents)) {
                    continue;
                }
                $granted = filter_var($consents[$channel->value], FILTER_VALIDATE_BOOL);
                $written = $granted ? MarketingConsent::grant($user, $channel) : MarketingConsent::withdraw($user, $channel);
                if ($written) {
                    $changes['consent.'.$channel->value] = ['old' => ! $granted, 'new' => $granted];
                }
            }

            if ($changes !== []) {
                app(AuditService::class)->log(
                    'notifications.preferences_updated',
                    $user,
                    old: array_map(fn ($c) => $c['old'], $changes),
                    new: array_map(fn ($c) => $c['new'], $changes),
                    actor: $actor ?? $user,
                );
            }
        });

        return $changes;
    }
}
