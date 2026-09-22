<?php

namespace App\Modules\Members\Services;

use App\Models\User;
use App\Modules\Members\Events\MembershipStatusChanged;
use ReflectionMethod;

/**
 * Thin bridge to the Notifications module (built in parallel). Calls
 * `App\Modules\Notifications\Services\Notify::send(User, key, data, category, transactional, dedupKey)`
 * only when that class exists at runtime; otherwise it is a silent no-op so the core flows never break.
 *
 * Integration hook: once the Notifications module ships, nothing here needs to change unless the
 * contract signature differs — adjust `send()` in that case.
 */
final class MemberNotifier
{
    public const NOTIFY_CLASS = 'App\\Modules\\Notifications\\Services\\Notify';

    public function membershipStatusChanged(MembershipStatusChanged $event): void
    {
        $membership = $event->membership;
        $this->send($membership->user, 'members.status.'.$event->to->value, [
            'member_number' => $membership->member_number,
            'status' => $event->to->value,
            'status_label' => $event->to->label(),
            'reason' => $event->reason,
        ], 'system', "members.status:{$membership->id}:".($event->historyId ?? $event->to->value));
    }

    public function deletionRequested(User $user, int $requestId): void
    {
        $this->send($user, 'members.deletion_requested', ['request_id' => $requestId], 'system', "members.deletion_requested:{$requestId}");
    }

    /** @param  array<string, mixed>  $data */
    public function send(User $user, string $key, array $data = [], string $category = 'system', ?string $dedupKey = null, bool $transactional = true): bool
    {
        if (! self::available()) {
            return false;
        }
        try {
            $method = new ReflectionMethod(self::NOTIFY_CLASS, 'send');
            if ($method->isStatic()) {
                $method->invoke(null, $user, $key, $data, $category, $transactional, $dedupKey);
            } else {
                $method->invoke(app(self::NOTIFY_CLASS), $user, $key, $data, $category, $transactional, $dedupKey);
            }

            return true;
        } catch (\Throwable $e) {
            report($e);

            return false;
        }
    }

    public static function available(): bool
    {
        return class_exists(self::NOTIFY_CLASS) && method_exists(self::NOTIFY_CLASS, 'send');
    }
}
