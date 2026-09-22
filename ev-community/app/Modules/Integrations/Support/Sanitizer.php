<?php

namespace App\Modules\Integrations\Support;

/**
 * Removes secrets from anything we persist or log (headers, payloads, meta, error messages).
 */
final class Sanitizer
{
    private const REDACTED = '[redacted]';

    private const SENSITIVE_KEY_PATTERN = '/(authorization|cookie|signature|token|secret|api[_-]?key|password|passwd|hmac|private|credential|card[_-]?number|cvv|cvc|pan\b|otp|x-api|bearer)/i';

    /** @param  array<string|int, mixed>  $values */
    public static function redact(array $values, int $depth = 0): array
    {
        if ($depth > 8) {
            return [self::REDACTED];
        }
        foreach ($values as $key => $value) {
            if (is_string($key) && preg_match(self::SENSITIVE_KEY_PATTERN, $key)) {
                $values[$key] = self::REDACTED;
            } elseif (is_array($value)) {
                $values[$key] = self::redact($value, $depth + 1);
            } elseif (is_string($value) && strlen($value) > 4000) {
                $values[$key] = mb_substr($value, 0, 4000).'…';
            }
        }

        return $values;
    }

    /** @param  array<string, array<int, string|null>|string|null>  $headers */
    public static function headers(array $headers): array
    {
        $out = [];
        foreach ($headers as $name => $value) {
            $flat = is_array($value) ? implode(', ', array_filter($value, fn ($v) => $v !== null)) : (string) $value;
            $out[strtolower((string) $name)] = preg_match(self::SENSITIVE_KEY_PATTERN, (string) $name) ? self::REDACTED : mb_substr($flat, 0, 500);
        }

        return $out;
    }

    /** Error messages may embed URLs with keys or full bodies; keep them short and strip query strings. */
    public static function error(?string $message, int $max = 500): ?string
    {
        if ($message === null || $message === '') {
            return null;
        }
        $message = preg_replace('/(\?|&)([^ \s]*)/', '$1…', $message) ?? $message;
        $message = preg_replace('/(key|token|secret|signature|password)=([^&\s]+)/i', '$1='.self::REDACTED, $message) ?? $message;

        return mb_substr(trim($message), 0, $max);
    }

    public static function truncate(?string $value, int $max = 200): ?string
    {
        if ($value === null) {
            return null;
        }

        return mb_strlen($value) > $max ? mb_substr($value, 0, $max - 1).'…' : $value;
    }
}
