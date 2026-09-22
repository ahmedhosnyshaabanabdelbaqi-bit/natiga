<?php

namespace App\Modules\Notifications\Support;

/**
 * Link hygiene for notification/announcement URLs. Only two shapes are ever stored or followed:
 *  - an internal absolute path (`/account/orders/01H...`), never protocol-relative (`//host`) or back-slashed;
 *  - an absolute `https://` URL.
 * Anything else (javascript:, data:, http://, relative paths) is dropped.
 */
final class NotificationUrl
{
    public const MAX_LENGTH = 2048;

    public static function sanitize(mixed $url): ?string
    {
        if (! is_string($url)) {
            return null;
        }
        $url = trim($url);
        if ($url === '' || mb_strlen($url) > self::MAX_LENGTH || preg_match('/[\x00-\x1F\x7F\s]/u', $url)) {
            return null;
        }
        if (self::isInternal($url)) {
            return $url;
        }
        if (preg_match('#^https://#i', $url) === 1 && filter_var($url, FILTER_VALIDATE_URL) !== false) {
            $host = parse_url($url, PHP_URL_HOST);

            return is_string($host) && $host !== '' ? $url : null;
        }

        return null;
    }

    public static function isValid(mixed $url): bool
    {
        return self::sanitize($url) !== null;
    }

    /** `/path` but not `//host` or `/\host` (browsers treat both as protocol-relative). */
    public static function isInternal(string $url): bool
    {
        return preg_match('#^/(?![/\\\\])#', $url) === 1;
    }

    /** Absolute URL for emails/SMS: internal paths are prefixed with APP_URL. */
    public static function absolute(?string $url, string $fallbackPath = '/account/notifications'): string
    {
        $base = rtrim((string) config('app.url'), '/');
        $url = self::sanitize($url);
        if ($url === null) {
            return $base.$fallbackPath;
        }

        return self::isInternal($url) ? $base.$url : $url;
    }
}
