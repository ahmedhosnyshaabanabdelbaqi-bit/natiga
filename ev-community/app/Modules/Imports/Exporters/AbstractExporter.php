<?php

namespace App\Modules\Imports\Exporters;

use App\Modules\Imports\Contracts\Exporter;

/**
 * Defaults for exporters: labels from lang files (`$langPrefix.name`, `$langPrefix.columns.<key>`),
 * no filters.
 */
abstract class AbstractExporter implements Exporter
{
    protected string $langPrefix = '';

    public function label(): array
    {
        return $this->translatePair($this->langPrefix().'.name');
    }

    public function filterRules(): array
    {
        return [];
    }

    /** @return array{key: string, label: array{ar: string, en: string}} */
    protected function column(string $key, ?array $label = null): array
    {
        return ['key' => $key, 'label' => $label ?? $this->translatePair($this->langPrefix().'.columns.'.$key)];
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
        return $this->langPrefix !== '' ? $this->langPrefix : 'imports.exporters.'.$this->key();
    }
}
