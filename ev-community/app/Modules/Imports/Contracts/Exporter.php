<?php

namespace App\Modules\Imports\Contracts;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder as QueryBuilder;

/**
 * One exportable list. Register in your module ServiceProvider:
 *
 *   Exporters::register(new OrdersExporter);
 *
 * Extend App\Modules\Imports\Exporters\AbstractExporter for sensible defaults.
 */
interface Exporter
{
    /** Unique snake_case key, e.g. `orders`, `members`. */
    public function key(): string;

    /** Permission required to request this export (checked in addition to `exports.view`). */
    public function permission(): string;

    /** @return array{ar: string, en: string} */
    public function label(): array;

    /**
     * Output columns in order. Headers are rendered in the export locale.
     *
     * @return list<array{key: string, label: array{ar: string, en: string}}>
     */
    public function columns(): array;

    /**
     * Laravel validation rules for the accepted filters (unknown filters are dropped).
     *
     * @return array<string, mixed>
     */
    public function filterRules(): array;

    /**
     * Query producing the records, already scoped to what `$user` may see and ordered deterministically
     * (ExportService iterates it with lazyById). Filters are validated against filterRules().
     *
     * @param  array<string, mixed>  $filters
     */
    public function query(array $filters, User $user): EloquentBuilder|QueryBuilder;

    /**
     * Map one record to output values keyed by column key (missing keys render as empty cells).
     *
     * @return array<string, scalar|null>
     */
    public function row(object $record, string $locale): array;
}
