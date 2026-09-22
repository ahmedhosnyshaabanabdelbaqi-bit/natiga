<?php

namespace App\Modules\System\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;

/**
 * The scheduler writes a heartbeat every minute (registered in SystemServiceProvider). Health checks and the
 * failed-jobs page read its age: older than STALE_AFTER_SECONDS means `schedule:run` is not running.
 */
final class SchedulerHeartbeat
{
    public const CACHE_KEY = 'ev.scheduler.heartbeat';

    public const STALE_AFTER_SECONDS = 300;

    public static function beat(): void
    {
        Cache::put(self::CACHE_KEY, now()->toIso8601String(), now()->addDay());
    }

    public static function lastAt(): ?CarbonImmutable
    {
        try {
            $value = Cache::get(self::CACHE_KEY);
        } catch (\Throwable) {
            return null;
        }

        return is_string($value) && $value !== '' ? CarbonImmutable::parse($value) : null;
    }

    public static function ageSeconds(): ?int
    {
        $last = self::lastAt();

        return $last ? max(0, (int) $last->diffInSeconds(now())) : null;
    }

    public static function isStale(): bool
    {
        $age = self::ageSeconds();

        return $age === null || $age > self::STALE_AFTER_SECONDS;
    }

    /** @return array{at: ?string, age_seconds: ?int, stale: bool} */
    public static function status(): array
    {
        return ['at' => self::lastAt()?->toIso8601String(), 'age_seconds' => self::ageSeconds(), 'stale' => self::isStale()];
    }
}
