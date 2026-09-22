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
 * Member preference matrix (category × channel).
 *
 *  - Transactional categories: in_app and email are locked ON (cannot be disabled); sms/whatsapp are optional (default on).
 *  - The pseudo-category `marketing` covers every non-transactional notification: in_app on by default,
 *    email/sms/whatsapp are opt-in (default off) and switching them on records marketing consent.
 */
final class NotificationPreferences
{
    public const MARKETING = NotificationCategory::MARKETING;

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

    /** Whether the member accepts this category on this channel (locked pairs are always true). */
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
     * Full matrix for the preferences page.
     *
     * @return array<int, array{category: string, label: string, transactional: bool, channels: array<string, array{enabled: bool, locked: bool, configured: bool, consent: bool}>}>
     */
    public static function matrix(User $user): array
    {
        $rows = NotificationPreference::query()->where('user_id', $user->id)->get()
            ->keyBy(fn (NotificationPreference $p) => $p->category.'.'.$p->channel->value);
        $configured = Channels::statusMap();
        $categories = array_merge(NotificationCategory::values(), [self::MARKETING]);
        $out = [];
        foreach ($categories as $category) {
            $channels = [];
            foreach (NotificationChannel::cases() as $channel) {
                $row = $rows->get($category.'.'.$channel->value);
                $locked = self::isLocked($category, $channel);
                $channels[$channel->value] = [
                    'enabled' => $locked ? true : ($row ? $row->enabled : self::defaultFor($category, $channel)),
                    'locked' => $locked,
                    'configured' => $configured[$channel->value],
                    'consent' => $category === self::MARKETING && $channel->requiresProvider() ? MarketingConsent::has($user, $channel) : true,
                ];
            }
            $out[] = [
                'category' => $category,
                'label' => __('notifications.categories.'.$category),
                'transactional' => $category !== self::MARKETING,
                'channels' => $channels,
            ];
        }

        return $out;
    }

    /**
     * Persist explicit choices. `$choices` = [category => [channel => bool]].
     * Locked pairs cannot be disabled (DomainException → 422). Enabling a marketing channel records consent.
     *
     * @param  array<string, array<string, bool>>  $choices
     * @return array<string, array{old: bool, new: bool}> changed pairs keyed "category.channel"
     */
    public static function update(User $user, array $choices, ?User $actor = null): array
    {
        $changes = [];
        DB::transaction(function () use ($user, $choices, &$changes) {
            foreach ($choices as $category => $channels) {
                $category = self::normaliseCategory((string) $category);
                foreach ((array) $channels as $channelValue => $enabled) {
                    $channel = NotificationChannel::tryFrom((string) $channelValue);
                    if ($channel === null) {
                        continue;
                    }
                    $enabled = filter_var($enabled, FILTER_VALIDATE_BOOL);
                    if (self::isLocked($category, $channel)) {
                        if (! $enabled) {
                            throw DomainException::because('notifications.errors.cannot_disable_transactional', [], "preferences.{$category}.{$channel->value}");
                        }

                        continue;
                    }
                    $current = self::allows($user, $category, $channel);
                    if ($current !== $enabled) {
                        $changes["{$category}.{$channel->value}"] = ['old' => $current, 'new' => $enabled];
                    }
                    NotificationPreference::query()->updateOrCreate(
                        ['user_id' => $user->id, 'category' => $category, 'channel' => $channel->value],
                        ['enabled' => $enabled],
                    );
                    if ($category === self::MARKETING && $channel->requiresProvider()) {
                        $enabled ? MarketingConsent::grant($user, $channel) : MarketingConsent::withdraw($user, $channel);
                    }
                }
            }
        });

        if ($changes !== []) {
            app(AuditService::class)->log(
                'notifications.preferences_updated',
                $user,
                old: array_map(fn ($c) => $c['old'], $changes),
                new: array_map(fn ($c) => $c['new'], $changes),
                actor: $actor ?? $user,
            );
        }

        return $changes;
    }
}
