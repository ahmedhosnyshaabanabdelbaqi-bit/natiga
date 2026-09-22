<?php

namespace App\Modules\Imports\Importers;

use App\Modules\Imports\Contracts\Importer;
use App\Modules\Imports\Services\ImportContext;
use Brick\Math\BigDecimal;
use Carbon\CarbonImmutable;
use Throwable;

/**
 * Defaults for importers: labels from lang/{ar,en}/<module>.php, trimming normalisation,
 * no duplicate detection, chunk size 200, plus parsing helpers for the values operators type
 * in Egyptian spreadsheets (Arabic-Indic digits, "1,250.50", d/m/Y dates...).
 *
 * Subclasses set `$langPrefix` (e.g. 'catalog.importers.products') so that
 *   <prefix>.name             → importer label
 *   <prefix>.columns.<key>    → column labels
 */
abstract class AbstractImporter implements Importer
{
    /** Translation prefix for the importer name and column labels. */
    protected string $langPrefix = '';

    /** Accepted date formats, tried in order (day-first, as used in Egypt). */
    protected const DATE_FORMATS = ['Y-m-d', 'Y/m/d', 'd/m/Y', 'd-m-Y', 'd.m.Y', 'Y-m-d H:i:s', 'Y-m-d H:i', 'd/m/Y H:i'];

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

    // ------------------------------------------------------------------ parsing helpers

    /** Arabic-Indic and Persian digits → ASCII, Arabic decimal/thousands separators → `.` / `,`. */
    protected function asciiDigits(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return strtr($value, [
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٫' => '.', '٬' => ',',
        ]);
    }

    /**
     * Canonical decimal string ("1,250.50" → "1250.50", "٤٨٫٥" → "48.5"), or null when the value is
     * not a plain decimal number. Thousands separators are accepted only in correct 3-digit groups.
     */
    protected function decimal(?string $value): ?string
    {
        $value = $this->asciiDigits($value);
        if ($value === null) {
            return null;
        }
        $value = str_replace(' ', '', trim($value));
        if (preg_match('/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/', $value)) {
            $value = str_replace(',', '', $value);
        }
        if (! preg_match('/^[+-]?(\d+(\.\d*)?|\.\d+)$/', $value)) {
            return null;
        }
        try {
            return (string) BigDecimal::of(ltrim($value, '+'));
        } catch (Throwable) {
            return null;
        }
    }

    /** `Y-m-d` from the accepted date formats (see DATE_FORMATS), or null when unparseable. */
    protected function date(?string $value): ?string
    {
        $value = $this->asciiDigits($value);
        if ($value === null || trim($value) === '') {
            return null;
        }
        $value = trim($value);
        $timezone = new \DateTimeZone((string) config('app.timezone', 'Africa/Cairo'));
        foreach (static::DATE_FORMATS as $format) {
            // `d`/`m` accept one or two digits; rolled-over dates (31/02) raise warnings and are rejected.
            $date = \DateTimeImmutable::createFromFormat('!'.$format, $value, $timezone);
            $errors = \DateTimeImmutable::getLastErrors();
            if ($date === false || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
                continue;
            }
            $year = (int) $date->format('Y');
            if ($year < 1900 || $year > 2200) {
                continue;
            }

            return CarbonImmutable::instance($date)->toDateString();
        }

        return null;
    }

    /** Uppercase ASCII code (currencies, SKUs...) or null. */
    protected function code(?string $value): ?string
    {
        $value = $this->asciiDigits($value);

        return $value === null || trim($value) === '' ? null : strtoupper(trim($value));
    }
}
