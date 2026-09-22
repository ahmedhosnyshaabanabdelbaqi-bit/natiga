<?php

namespace App\Modules\Imports\Services;

use App\Models\User;
use App\Modules\Imports\Contracts\Importer;
use App\Modules\Imports\Models\Import;
use Closure;

/**
 * Per-run state handed to importers: the import, the acting user, importer options, an in-file
 * duplicate tracker and a memo for lookups (currencies, categories...).
 */
final class ImportContext
{
    /** @var array<string, array<string, int>> scope => value => first row number */
    private array $seen = [];

    /** @var array<string, mixed> */
    private array $memo = [];

    private int $rowNumber = 0;

    /** @var array{type: string, id: int|string}|null */
    private ?array $entity = null;

    public function __construct(
        public readonly Import $import,
        public readonly Importer $importer,
        public readonly ?User $user,
        public readonly string $locale,
    ) {}

    /** @return array<string, mixed> importer-specific options given at upload time */
    public function options(): array
    {
        return (array) ($this->import->options['importer'] ?? []);
    }

    public function option(string $key, mixed $default = null): mixed
    {
        return $this->options()[$key] ?? $default;
    }

    public function rowNumber(): int
    {
        return $this->rowNumber;
    }

    public function setRow(int $rowNumber): void
    {
        $this->rowNumber = $rowNumber;
        $this->entity = null;
    }

    /**
     * Track a business key across the file. Returns true when the value was already seen in an
     * earlier row of this run (an in-file duplicate), false the first time.
     */
    public function seen(string $scope, string|int|null $value): bool
    {
        if ($value === null || $value === '') {
            return false;
        }
        $value = (string) $value;
        if (isset($this->seen[$scope][$value])) {
            return true;
        }
        $this->seen[$scope][$value] = $this->rowNumber;

        return false;
    }

    public function firstSeenAt(string $scope, string|int $value): ?int
    {
        return $this->seen[$scope][(string) $value] ?? null;
    }

    /** Memoised lookup shared across rows of the run (e.g. `$ctx->remember('currencies', fn () => ...)`). */
    public function remember(string $key, Closure $resolver): mixed
    {
        if (! array_key_exists($key, $this->memo)) {
            $this->memo[$key] = $resolver();
        }

        return $this->memo[$key];
    }

    public function forget(string $key): void
    {
        unset($this->memo[$key]);
    }

    /** For importers that write through the query builder: record what the row produced. */
    public function linkEntity(string $type, int|string $id): void
    {
        $this->entity = ['type' => $type, 'id' => $id];
    }

    /** @return array{type: string, id: int|string}|null */
    public function takeEntity(): ?array
    {
        $entity = $this->entity;
        $this->entity = null;

        return $entity;
    }

    /** Start a fresh duplicate-tracking pass (validation and processing are separate passes). */
    public function resetSeen(): void
    {
        $this->seen = [];
    }
}
