<?php

namespace App\Modules\Imports\Contracts;

use App\Modules\Imports\Services\ImportContext;
use Illuminate\Database\Eloquent\Model;

/**
 * One importable entity type. Register in your module ServiceProvider:
 *
 *   Importers::register(new ProductsImporter);
 *
 * Extend App\Modules\Imports\Importers\AbstractImporter for sensible defaults.
 */
interface Importer
{
    /** Unique snake_case key, e.g. `products`, `exchange_rates`. */
    public function key(): string;

    /** Permission required to run this import (checked in addition to `imports.manage`). */
    public function permission(): string;

    /** @return array{ar: string, en: string} */
    public function label(): array;

    /**
     * Columns accepted by the importer. Header cells are matched to the key or to either label
     * (case/whitespace-insensitive), so operators can use Arabic or English headers.
     *
     * @return list<array{key: string, label: array{ar: string, en: string}, required: bool, example: string|null}>
     */
    public function columns(): array;

    /**
     * Turn raw cell strings (keyed by column key) into typed values: trim, cast, canonicalise codes...
     *
     * @param  array<string, string|null>  $raw
     * @return array<string, mixed>
     */
    public function normalizeRow(array $raw): array;

    /**
     * Return validation errors keyed by column key (empty array = valid). Messages must be translated.
     *
     * @param  array<string, mixed>  $row  normalized row
     * @return array<string, string>
     */
    public function validateRow(array $row, ImportContext $ctx): array;

    /**
     * True when the row already exists (in the database or earlier in the same file, see ImportContext::seen()).
     *
     * @param  array<string, mixed>  $row
     */
    public function isDuplicate(array $row, ImportContext $ctx): bool;

    /**
     * Persist one valid row (called inside a transaction). Return the created/updated model when there is one,
     * or null after ImportContext::linkEntity() for non-Eloquent targets. Throw SkipRowException to skip the row.
     *
     * @param  array<string, mixed>  $row
     */
    public function importRow(array $row, ImportContext $ctx): ?Model;

    /** Rows loaded per chunk while validating/importing. */
    public function chunkSize(): int;
}
