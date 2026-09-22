<?php

namespace App\Modules\Notifications\Services;

use App\Models\User;
use App\Modules\Notifications\Models\Notification;
use Illuminate\Database\Eloquent\Builder;

/**
 * Static entry point for every module:
 *
 *   Notify::send($user, 'orders.confirmed', ['order_number' => $order->order_number, 'amount' => $money], 'orders',
 *       transactional: true, dedupKey: 'orders.confirmed:'.$order->id, url: '/account/orders/'.$order->public_id);
 *
 * Contract shape `Notify::send(User $user, string $key, array $data, string $category, bool $transactional = true, ?string $dedupKey = null)`
 * is preserved; `$url` and `$channels` are optional extensions.
 */
final class Notify
{
    /**
     * @param  array<string, mixed>  $data
     * @param  string[]|null  $channels
     */
    public static function send(User $user, string $key, array $data = [], string $category = 'system', bool $transactional = true, ?string $dedupKey = null, ?string $url = null, ?array $channels = null): ?Notification
    {
        return app(NotificationService::class)->send($user, $key, $data, $category, $transactional, $dedupKey, $url, $channels);
    }

    /**
     * @param  iterable<int, User>|Builder<User>  $users
     * @param  array<string, mixed>  $data
     * @param  string[]|null  $channels
     */
    public static function sendMany(iterable|Builder $users, string $key, array $data = [], string $category = 'system', bool $transactional = true, ?string $dedupKey = null, ?string $url = null, ?array $channels = null): int
    {
        return app(NotificationService::class)->sendMany($users, $key, $data, $category, $transactional, $dedupKey, $url, $channels);
    }

    public static function markRead(User $user, Notification $notification): Notification
    {
        return app(NotificationService::class)->markRead($user, $notification);
    }

    public static function markAllRead(User $user, ?string $category = null): int
    {
        return app(NotificationService::class)->markAllRead($user, $category);
    }

    public static function unreadCount(User $user): int
    {
        return app(NotificationService::class)->unreadCount($user);
    }
}
