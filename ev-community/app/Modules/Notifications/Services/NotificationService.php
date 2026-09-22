<?php

namespace App\Modules\Notifications\Services;

use App\Models\User;
use App\Modules\Notifications\Jobs\SendEmailNotification;
use App\Modules\Notifications\Jobs\SendSmsNotification;
use App\Modules\Notifications\Jobs\SendWhatsAppNotification;
use App\Modules\Notifications\Models\Enums\DeliveryStatus;
use App\Modules\Notifications\Models\Enums\NotificationCategory;
use App\Modules\Notifications\Models\Enums\NotificationChannel;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\System\Services\Settings;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\LazyCollection;
use Illuminate\Support\Str;

/**
 * The notification pipeline. See docs/modules/notifications.md.
 *
 * Text resolution order (per recipient locale):
 *   1. `$data['_title']` / `$data['_body']` literal (string or ['ar' => .., 'en' => ..])
 *   2. `$data['_title_key']` / `$data['_body_key']` translation keys (module lang files)
 *   3. `notifications.templates.<key>.title|body`
 *   4. `$data['title']` / `$data['body']`, then the humanised key
 * Underscore-prefixed keys are meta and never stored. `member_name`, `member_number` and `site` are always available.
 */
final class NotificationService
{
    public const DEFAULT_CHANNELS = ['in_app', 'email'];

    private const UNREAD_TTL_SECONDS = 60;

    /**
     * @param  array<string, mixed>  $data
     * @param  string[]|null  $channels  null = in_app + email
     * @return Notification|null null only when the member opted out of in-app marketing notifications
     */
    public function send(User $user, string $key, array $data = [], string $category = 'system', bool $transactional = true, ?string $dedupKey = null, ?string $url = null, ?array $channels = null): ?Notification
    {
        $category = NotificationCategory::tryFrom($category)?->value ?? NotificationCategory::System->value;
        $preferenceCategory = $transactional ? $category : NotificationPreferences::MARKETING;
        $requested = $this->normaliseChannels($channels);

        if ($dedupKey !== null) {
            $existing = $this->findByDedup($user, $dedupKey);
            if ($existing !== null) {
                return $existing;
            }
        }

        if (! NotificationPreferences::allows($user, $preferenceCategory, NotificationChannel::InApp)) {
            return null; // member opted out of marketing notifications entirely
        }

        $locale = $user->preferredLocale();
        [$title, $body] = $this->resolveText($key, $data, $locale, $user);
        $url ??= is_string($data['_url'] ?? null) ? $data['_url'] : null;

        try {
            $notification = DB::transaction(fn () => Notification::query()->create([
                'user_id' => $user->id,
                'category' => $category,
                'key' => Str::limit($key, 120, ''),
                'title' => Str::limit($title, 255, ''),
                'body' => $body,
                'url' => $url !== null ? Str::limit($url, 2048, '') : null,
                'data' => $this->storableData($data),
                'is_transactional' => $transactional,
                'dedup_key' => $dedupKey !== null ? Str::limit($dedupKey, 191, '') : null,
                'created_at' => now(),
            ]));
        } catch (UniqueConstraintViolationException $e) {
            $existing = $dedupKey !== null ? $this->findByDedup($user, $dedupKey) : null;
            if ($existing === null) {
                throw $e;
            }

            return $existing; // a concurrent retry won: no new deliveries
        }

        $this->createDeliveries($notification, $user, $requested, $preferenceCategory, $transactional);
        $this->forgetUnreadCount($user);

        return $notification;
    }

    /**
     * Chunked bulk send (queries are chunked by 500 users). Returns the number of notifications created or reused.
     *
     * @param  iterable<int, User>|Builder<User>  $users
     * @param  array<string, mixed>  $data
     * @param  string[]|null  $channels
     */
    public function sendMany(iterable|Builder $users, string $key, array $data = [], string $category = 'system', bool $transactional = true, ?string $dedupKey = null, ?string $url = null, ?array $channels = null, int $chunkSize = 500): int
    {
        $count = 0;
        $handle = function (iterable $chunk) use (&$count, $key, $data, $category, $transactional, $dedupKey, $url, $channels): void {
            foreach ($chunk as $user) {
                if ($user instanceof User && $this->send($user, $key, $data, $category, $transactional, $dedupKey, $url, $channels) !== null) {
                    $count++;
                }
            }
        };

        if ($users instanceof Builder) {
            $users->chunkById($chunkSize, fn ($chunk) => $handle($chunk));
        } else {
            LazyCollection::make(fn () => yield from $users)->chunk($chunkSize)->each(fn ($chunk) => $handle($chunk));
        }

        return $count;
    }

    public function markRead(User $user, Notification $notification): Notification
    {
        if ($notification->user_id !== $user->id) {
            abort(404);
        }
        if ($notification->read_at === null) {
            $notification->forceFill(['read_at' => now()])->save();
            NotificationDelivery::query()->where('notification_id', $notification->id)->where('channel', NotificationChannel::InApp->value)
                ->whereIn('status', [DeliveryStatus::Sent->value, DeliveryStatus::Delivered->value])
                ->update(['status' => DeliveryStatus::Read->value, 'delivered_at' => now(), 'updated_at' => now()]);
            $this->forgetUnreadCount($user);
        }

        return $notification;
    }

    public function markAllRead(User $user, ?string $category = null): int
    {
        $query = Notification::query()->forUser($user)->unread()->category($category);
        $ids = $query->pluck('id');
        if ($ids->isEmpty()) {
            return 0;
        }
        $updated = Notification::query()->whereIn('id', $ids)->update(['read_at' => now()]);
        NotificationDelivery::query()->whereIn('notification_id', $ids)->where('channel', NotificationChannel::InApp->value)
            ->whereIn('status', [DeliveryStatus::Sent->value, DeliveryStatus::Delivered->value])
            ->update(['status' => DeliveryStatus::Read->value, 'delivered_at' => now(), 'updated_at' => now()]);
        $this->forgetUnreadCount($user);

        return $updated;
    }

    /** Cached for 60s per user; invalidated on every write through this service. */
    public function unreadCount(User $user): int
    {
        return (int) Cache::remember(self::unreadCacheKey($user->id), self::UNREAD_TTL_SECONDS, fn () => Notification::query()->forUser($user)->unread()->count());
    }

    public function forgetUnreadCount(User|int $user): void
    {
        Cache::forget(self::unreadCacheKey($user instanceof User ? $user->id : $user));
    }

    public static function unreadCacheKey(int $userId): string
    {
        return 'notifications.unread.'.$userId;
    }

    public function paginateFor(User $user, ?string $category = null, bool $unreadOnly = false, int $perPage = 20): LengthAwarePaginator
    {
        return Notification::query()->forUser($user)
            ->category($category)
            ->when($unreadOnly, fn (Builder $q) => $q->unread())
            ->orderByDesc('created_at')->orderByDesc('id')
            ->paginate($perPage)->withQueryString();
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{0: string, 1: string}
     */
    public function resolveText(string $key, array $data, string $locale, ?User $user = null): array
    {
        $params = $this->params($data, $locale, $user);
        $title = $this->literal($data['_title'] ?? null, $locale)
            ?? $this->translate($data['_title_key'] ?? null, $params, $locale)
            ?? $this->translate('notifications.templates.'.$key.'.title', $params, $locale)
            ?? (is_string($data['title'] ?? null) ? $data['title'] : Str::headline((string) Str::afterLast($key, '.')));
        $body = $this->literal($data['_body'] ?? null, $locale)
            ?? $this->translate($data['_body_key'] ?? null, $params, $locale)
            ?? $this->translate('notifications.templates.'.$key.'.body', $params, $locale)
            ?? (is_string($data['body'] ?? null) ? $data['body'] : '');

        return [trim($title), trim($body)];
    }

    /**
     * Variables handed to the email renderer for a stored notification.
     *
     * @return array<string, mixed>
     */
    public function variablesFor(Notification $notification, User $user, string $locale): array
    {
        return array_merge($notification->data ?? [], [
            'member_name' => $user->name,
            'member_number' => $user->membership?->member_number ?? '',
            'site' => (string) Settings::localized('branding.site_name', $locale, config('app.name')),
            'url' => $this->absoluteUrl($notification->url),
            'title' => $notification->title,
            'body' => $notification->body,
        ]);
    }

    public function absoluteUrl(?string $url): string
    {
        if ($url === null || $url === '') {
            return rtrim((string) config('app.url'), '/').'/account/notifications';
        }

        return str_starts_with($url, '/') ? rtrim((string) config('app.url'), '/').$url : $url;
    }

    /** @param  string[]  $requested */
    private function createDeliveries(Notification $notification, User $user, array $requested, string $preferenceCategory, bool $transactional): void
    {
        foreach ($requested as $value) {
            $channel = NotificationChannel::from($value);
            [$status, $reason] = $this->evaluate($user, $channel, $preferenceCategory, $transactional);
            $delivery = NotificationDelivery::query()->create([
                'notification_id' => $notification->id,
                'channel' => $channel->value,
                'status' => $status->value,
                'provider' => $channel === NotificationChannel::InApp ? 'in_app' : null,
                'error' => $reason,
                'attempts' => 0,
                'queued_at' => now(),
                'sent_at' => $status === DeliveryStatus::Sent ? now() : null,
            ]);
            if ($status !== DeliveryStatus::Queued) {
                continue;
            }
            match ($channel) {
                NotificationChannel::Email => SendEmailNotification::dispatch($delivery->id)->afterCommit(),
                NotificationChannel::Sms => SendSmsNotification::dispatch($delivery->id)->afterCommit(),
                NotificationChannel::WhatsApp => SendWhatsAppNotification::dispatch($delivery->id)->afterCommit(),
                NotificationChannel::InApp => null,
            };
        }
    }

    /** @return array{0: DeliveryStatus, 1: ?string} */
    private function evaluate(User $user, NotificationChannel $channel, string $preferenceCategory, bool $transactional): array
    {
        if ($channel === NotificationChannel::InApp) {
            return [DeliveryStatus::Sent, null];
        }
        if (! Channels::isConfigured($channel)) {
            return [DeliveryStatus::Skipped, NotificationDelivery::SKIP_NOT_CONFIGURED];
        }
        if (! NotificationPreferences::allows($user, $preferenceCategory, $channel)) {
            return [DeliveryStatus::Skipped, NotificationDelivery::SKIP_PREFERENCE_DISABLED];
        }
        if (! $transactional && ! MarketingConsent::has($user, $channel)) {
            return [DeliveryStatus::Skipped, NotificationDelivery::SKIP_NO_CONSENT];
        }
        if ($channel === NotificationChannel::Email && ! filter_var($user->email, FILTER_VALIDATE_EMAIL)) {
            return [DeliveryStatus::Skipped, NotificationDelivery::SKIP_NO_EMAIL];
        }
        if ($channel !== NotificationChannel::Email && ! $user->mobile) {
            return [DeliveryStatus::Skipped, NotificationDelivery::SKIP_NO_MOBILE];
        }

        return [DeliveryStatus::Queued, null];
    }

    /** @return string[] */
    private function normaliseChannels(?array $channels): array
    {
        $values = $channels === null ? self::DEFAULT_CHANNELS : array_map(fn ($c) => $c instanceof NotificationChannel ? $c->value : (string) $c, $channels);
        $values = array_values(array_unique(array_filter($values, fn (string $v) => NotificationChannel::tryFrom($v) !== null)));
        if (! in_array(NotificationChannel::InApp->value, $values, true)) {
            array_unshift($values, NotificationChannel::InApp->value);
        }

        return $values;
    }

    private function findByDedup(User $user, string $dedupKey): ?Notification
    {
        return Notification::query()->where('user_id', $user->id)->where('dedup_key', Str::limit($dedupKey, 191, ''))->first();
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, string>
     */
    private function params(array $data, string $locale, ?User $user): array
    {
        $params = [
            'site' => (string) Settings::localized('branding.site_name', $locale, config('app.name')),
            'member_name' => $user?->name ?? '',
            'member_number' => $user?->membership?->member_number ?? '',
        ];
        foreach ($data as $name => $value) {
            if (! is_string($name) || str_starts_with($name, '_')) {
                continue;
            }
            if (is_scalar($value) || $value instanceof \Stringable) {
                $params[$name] = is_bool($value) ? ($value ? __('core.labels.yes', [], $locale) : __('core.labels.no', [], $locale)) : (string) $value;
            }
        }

        return $params;
    }

    /** @return array<string, mixed> */
    private function storableData(array $data): array
    {
        return array_filter($data, fn ($value, $name) => is_string($name) && ! str_starts_with($name, '_') && (is_scalar($value) || is_array($value) || $value === null), ARRAY_FILTER_USE_BOTH);
    }

    private function literal(mixed $value, string $locale): ?string
    {
        if (is_string($value)) {
            return $value;
        }
        if (is_array($value)) {
            $text = $value[$locale] ?? $value[config('app.fallback_locale', 'en')] ?? null;
            if ($text === null) {
                foreach ($value as $candidate) {
                    if (is_string($candidate) && $candidate !== '') {
                        return $candidate;
                    }
                }
            }

            return is_string($text) ? $text : null;
        }

        return null;
    }

    /** @param  array<string, string>  $params */
    private function translate(?string $translationKey, array $params, string $locale): ?string
    {
        if ($translationKey === null || $translationKey === '') {
            return null;
        }
        if (! trans()->has($translationKey, $locale)) {
            return null;
        }
        $text = trans()->get($translationKey, $params, $locale);

        return is_string($text) ? $text : null;
    }
}
