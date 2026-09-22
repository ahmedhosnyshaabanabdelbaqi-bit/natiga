<?php

namespace App\Modules\Imports\Services;

use App\Models\User;
use App\Modules\Imports\Contracts\Importer;
use App\Support\Exceptions\DomainException;
use InvalidArgumentException;

/**
 * Registry of importers. Modules register theirs in their ServiceProvider::boot().
 */
final class Importers
{
    /** @var array<string, Importer> */
    private static array $importers = [];

    public static function register(Importer $importer): void
    {
        $key = $importer->key();
        if (! preg_match('/^[a-z][a-z0-9_]{1,59}$/', $key)) {
            throw new InvalidArgumentException("Importer key [{$key}] must be snake_case.");
        }
        self::$importers[$key] = $importer;
    }

    /** @return array<string, Importer> */
    public static function all(): array
    {
        ksort(self::$importers);

        return self::$importers;
    }

    public static function get(string $key): ?Importer
    {
        return self::$importers[$key] ?? null;
    }

    public static function has(string $key): bool
    {
        return isset(self::$importers[$key]);
    }

    public static function find(string $key): Importer
    {
        return self::get($key) ?? throw DomainException::because('imports.errors.unknown_type', ['type' => $key], 'type');
    }

    /** @return array<string, Importer> importers the user may run */
    public static function availableFor(User $user): array
    {
        return array_filter(self::all(), fn (Importer $importer) => $user->can($importer->permission()));
    }

    public static function reset(): void
    {
        self::$importers = [];
    }
}
