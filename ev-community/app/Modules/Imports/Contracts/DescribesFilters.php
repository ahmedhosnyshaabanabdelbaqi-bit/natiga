<?php

namespace App\Modules\Imports\Contracts;

/**
 * Optional companion of Exporter: describes the filters the admin "New export" dialog can offer.
 * Exporters without it are still requestable from their own list pages (which pass the current
 * list filters), the dialog then only offers the format.
 *
 * Field types mirror the shared FiltersBar: select | date | search.
 */
interface DescribesFilters
{
    /**
     * @return list<array{key: string, type: 'select'|'date'|'search', label: string, options?: list<array{value: string, label: string}>}>
     */
    public function filterFields(): array;
}
