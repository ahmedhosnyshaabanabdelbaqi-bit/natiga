<?php

namespace App\Modules\Imports\Services;

use App\Models\User;
use App\Modules\Imports\Contracts\Exporter;
use App\Support\Exceptions\DomainException;
use InvalidArgumentException;

/**
 * Registry of exporters. Modules register theirs in their ServiceProvider::boot().
 */
final class Exporters
{
    /** @var array<string, Exporter> */
    private static array $exporters = [];

    public static function register(Exporter $exporter): void
    {
        $key = $exporter->key();
        if (! preg_match('/^[a-z][a-z0-9_]{1,59}$/', $key)) {
            throw new InvalidArgumentException("Exporter key [{$key}] must be snake_case.");
        }
        self::$exporters[$key] = $exporter;
    }

    /** @return array<string, Exporter> */
    public static function all(): array
    {
        ksort(self::$exporters);

        return self::$exporters;
    }

    public static function get(string $key): ?Exporter
    {
        return self::$exporters[$key] ?? null;
    }

    public static function has(string $key): bool
    {
        return isset(self::$exporters[$key]);
    }

    public static function find(string $key): Exporter
    {
        return self::get($key) ?? throw DomainException::because('imports.errors.unknown_export_type', ['type' => $key], 'type');
    }

    /** @return array<string, Exporter> exporters the user may request */
    public static function availableFor(User $user): array
    {
        return array_filter(self::all(), fn (Exporter $exporter) => $user->can($exporter->permission()));
    }

    public static function reset(): void
    {
        self::$exporters = [];
    }
}
