<?php

namespace App\Modules\Imports\Services;

use App\Modules\Imports\Contracts\Importer;

/**
 * Matches file headers to importer columns by key or by Arabic/English label.
 *
 * Matching ignores case, spacing, `_ - . : * ( ) [ ]`, Arabic diacritics/tatweel and the usual
 * Arabic letter variants (أ إ آ → ا, ة → ه, ى → ي), so "Base currency", "base_currency" and
 * "العملة الأساسية" all land on the same column.
 */
final class ColumnMapper
{
    public static function normalize(string $header): string
    {
        $header = preg_replace('/[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}\x{0640}\x{064B}-\x{0652}\x{0670}]/u', '', $header) ?? $header;
        $header = strtr($header, ['أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ٱ' => 'ا', 'ى' => 'ي', 'ة' => 'ه', 'ؤ' => 'و', 'ئ' => 'ي']);
        $header = mb_strtolower($header);
        $header = str_replace(['_', '-', '.', ':', '*', '(', ')', '[', ']', '/', '\\'], ' ', $header);

        return trim(preg_replace('/\s+/u', ' ', $header) ?? $header);
    }

    /**
     * Automatic mapping: column key => header index (or null when no header matches).
     * The first matching header wins; a header is used for one column at most.
     *
     * @param  list<string>  $headers
     * @return array<string, int|null>
     */
    public static function autoMap(array $headers, Importer $importer): array
    {
        $normalizedHeaders = array_map(fn (string $h) => self::normalize($h), $headers);
        $mapping = [];
        $used = [];
        foreach ($importer->columns() as $column) {
            $candidates = array_filter(array_unique([
                self::normalize($column['key']),
                self::normalize((string) ($column['label']['ar'] ?? '')),
                self::normalize((string) ($column['label']['en'] ?? '')),
            ]), fn (string $c) => $c !== '');
            $mapping[$column['key']] = null;
            foreach ($normalizedHeaders as $index => $header) {
                if ($header !== '' && ! isset($used[$index]) && in_array($header, $candidates, true)) {
                    $mapping[$column['key']] = $index;
                    $used[$index] = true;
                    break;
                }
            }
        }

        return $mapping;
    }

    /**
     * Keep only known columns and in-range, unique header indexes.
     *
     * @param  array<string, mixed>  $mapping  column key => header index|null (user input)
     * @param  list<string>  $headers
     * @return array<string, int|null>
     */
    public static function sanitize(array $mapping, array $headers, Importer $importer): array
    {
        $clean = [];
        $used = [];
        foreach ($importer->columns() as $column) {
            $value = $mapping[$column['key']] ?? null;
            $index = is_numeric($value) ? (int) $value : null;
            if ($index !== null && ($index < 0 || $index >= count($headers) || isset($used[$index]))) {
                $index = null;
            }
            if ($index !== null) {
                $used[$index] = true;
            }
            $clean[$column['key']] = $index;
        }

        return $clean;
    }

    /**
     * @param  array<string, int|null>  $mapping
     * @return list<string> required column keys that have no header
     */
    public static function missingRequired(array $mapping, Importer $importer): array
    {
        $missing = [];
        foreach ($importer->columns() as $column) {
            if ($column['required'] && ($mapping[$column['key']] ?? null) === null) {
                $missing[] = $column['key'];
            }
        }

        return $missing;
    }

    /**
     * @param  array<string, int|null>  $mapping
     * @param  list<string>  $headers
     * @return list<int> header indexes not used by any column
     */
    public static function unmappedHeaders(array $mapping, array $headers): array
    {
        $used = array_filter(array_values($mapping), fn ($i) => $i !== null);

        return array_values(array_diff(array_keys($headers), $used));
    }

    /**
     * Raw cell strings keyed by column key for one row.
     *
     * @param  list<string|null>  $cells
     * @param  array<string, int|null>  $mapping
     * @return array<string, string|null>
     */
    public static function apply(array $cells, array $mapping): array
    {
        $raw = [];
        foreach ($mapping as $key => $index) {
            $raw[$key] = $index === null ? null : ($cells[$index] ?? null);
        }

        return $raw;
    }
}
