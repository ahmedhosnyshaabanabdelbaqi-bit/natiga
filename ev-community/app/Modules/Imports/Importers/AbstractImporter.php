<?php

namespace App\Modules\Imports\Importers;

use App\Modules\Imports\Contracts\Importer;
use App\Modules\Imports\Services\ImportContext;

/**
 * Defaults for importers: labels from lang/{ar,en}/<module>.php, trimming normalisation,
 * no duplicate detection, chunk size 200.
 *
 * Subclasses set `$langPrefix` (e.g. 'catalog.importers.products') so that
 *   <prefix>.name             → importer label
 *   <prefix>.columns.<key>    → column labels
 */
abstract class AbstractImporter implements Importer
{
    /** Translation prefix for the importer name and column labels. */
    protected string $langPrefix = '';

    public function label(): array
    {
        return $this->translatePair($this->langPrefix().'.name');
    }

    public function normalizeRow(array $raw): array
    {
        $row = [];
        foreach ($raw as $key => $value) {
            if (is_string($value)) {
                $value = trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
                $value = $value === '' ? null : $value;
            }
            $row[$key] = $value;
        }

        return $row;
    }

    public function isDuplicate(array $row, ImportContext $ctx): bool
    {
        return false;
    }

    public function chunkSize(): int
    {
        return 200;
    }

    /**
     * @return array{key: string, label: array{ar: string, en: string}, required: bool, example: string|null}
     */
    protected function column(string $key, bool $required = false, ?string $example = null, ?array $label = null): array
    {
        return [
            'key' => $key,
            'label' => $label ?? $this->translatePair($this->langPrefix().'.columns.'.$key),
            'required' => $required,
            'example' => $example,
        ];
    }

    /** @return array{ar: string, en: string} */
    protected function translatePair(string $key): array
    {
        return [
            'ar' => (string) __($key, [], 'ar'),
            'en' => (string) __($key, [], 'en'),
        ];
    }

    protected function langPrefix(): string
    {
        return $this->langPrefix !== '' ? $this->langPrefix : 'imports.importers.'.$this->key();
    }
}
