<?php

namespace App\Support;

/**
 * The active company for the current request, job or console command.
 *
 * Kept as explicit process state rather than read from the authenticated user
 * on every query, so queue jobs and scheduled work behave identically to HTTP
 * requests.
 */
class CompanyContext
{
    protected static ?int $companyId = null;

    public static function set(?int $companyId): void
    {
        static::$companyId = $companyId;
    }

    public static function id(): ?int
    {
        return static::$companyId;
    }

    public static function idOrFail(): int
    {
        if (static::$companyId === null) {
            throw new \RuntimeException('No active company in context.');
        }

        return static::$companyId;
    }

    /** Run a callback against another company, then restore the previous one. */
    public static function forCompany(?int $companyId, callable $callback): mixed
    {
        $previous = static::$companyId;
        static::$companyId = $companyId;

        try {
            return $callback();
        } finally {
            static::$companyId = $previous;
        }
    }

    public static function clear(): void
    {
        static::$companyId = null;
    }
}
