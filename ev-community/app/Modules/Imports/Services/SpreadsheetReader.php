<?php

namespace App\Modules\Imports\Services;

use App\Support\Exceptions\DomainException;
use DateInterval;
use DateTimeInterface;
use Generator;
use OpenSpout\Common\Entity\Cell;
use OpenSpout\Common\Entity\Cell\ErrorCell;
use OpenSpout\Common\Entity\Cell\FormulaCell;
use OpenSpout\Reader\CSV\Options as CsvOptions;
use OpenSpout\Reader\CSV\Reader as CsvReader;
use OpenSpout\Reader\ReaderInterface;
use OpenSpout\Reader\XLSX\Options as XlsxOptions;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;
use Throwable;

/**
 * Streams the rows of an uploaded CSV/XLSX file as lists of strings (openspout).
 *
 *  - CSV: UTF-8 (with or without BOM), UTF-16 with BOM, and Windows-1256 (Arabic Excel "CSV") are
 *    converted to UTF-8; the delimiter (`,` `;` or tab) is detected from the first line.
 *  - XLSX: first worksheet; dates become `Y-m-d` (or `Y-m-d H:i:s`), formulas their cached value,
 *    numbers are printed without float noise.
 *
 * Row numbers are the 1-based line numbers of the sheet, so they match what the operator sees
 * in Excel. Blank rows are skipped. The first non-blank row is the header.
 */
final class SpreadsheetReader
{
    public const FORMATS = ['csv', 'xlsx'];

    /** Longest cell value kept (longer values are truncated; importers validate their own limits). */
    public const MAX_CELL_LENGTH = 5000;

    /** Columns read per row (wider sheets are cut; no importer needs this many). */
    public const MAX_COLUMNS = 100;

    /**
     * @return Generator<int, list<string|null>> sheet row number => cells
     *
     * @throws DomainException when the file cannot be read
     */
    public function rows(string $path, string $format): Generator
    {
        $format = strtolower($format);
        if (! in_array($format, self::FORMATS, true)) {
            throw DomainException::because('imports.errors.unsupported_format', ['formats' => implode(', ', self::FORMATS)], 'file');
        }

        $temp = null;
        try {
            if ($format === 'csv') {
                [$temp, $delimiter] = $this->prepareCsv($path);
                $options = new CsvOptions;
                $options->FIELD_DELIMITER = $delimiter;
                $options->SHOULD_PRESERVE_EMPTY_ROWS = true;
                $reader = new CsvReader($options);
                $reader->open($temp);
            } else {
                $options = new XlsxOptions;
                $options->SHOULD_FORMAT_DATES = false;
                $options->SHOULD_PRESERVE_EMPTY_ROWS = true;
                $reader = new XlsxReader($options);
                $reader->open($path);
            }
        } catch (DomainException $e) {
            $this->cleanup($temp);
            throw $e;
        } catch (Throwable $e) {
            $this->cleanup($temp);
            report($e);
            throw DomainException::because('imports.errors.unreadable', [], 'file');
        }

        try {
            yield from $this->iterate($reader);
        } catch (DomainException $e) {
            throw $e;
        } catch (Throwable $e) {
            report($e);
            throw DomainException::because('imports.errors.unreadable', [], 'file');
        } finally {
            $reader->close();
            $this->cleanup($temp);
        }
    }

    /**
     * Header (first non-blank row) and the data rows after it.
     *
     * @return array{0: list<string>, 1: Generator<int, list<string|null>>}|null null when the file has no header
     */
    public function open(string $path, string $format): ?array
    {
        $rows = $this->rows($path, $format);
        foreach ($rows as $cells) {
            if ($this->isBlank($cells)) {
                continue;
            }
            $headers = array_map(fn (?string $h) => trim((string) $h), $cells);
            // Drop trailing empty header cells (Excel often exports them).
            while ($headers !== [] && end($headers) === '') {
                array_pop($headers);
            }
            if ($headers === []) {
                return null;
            }
            $rows->next();

            return [$headers, $this->remaining($rows, count($headers))];
        }

        return null;
    }

    /** @param list<string|null> $cells */
    public function isBlank(array $cells): bool
    {
        foreach ($cells as $cell) {
            if ($cell !== null && trim($cell) !== '') {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  Generator<int, list<string|null>>  $rows  positioned on the first data row
     * @return Generator<int, list<string|null>>
     */
    private function remaining(Generator $rows, int $width): Generator
    {
        while ($rows->valid()) {
            // Cells without a header cannot be mapped to a column: keep exactly one cell per header.
            $cells = array_slice(array_pad($rows->current(), $width, null), 0, $width);
            $number = (int) $rows->key();
            $rows->next();
            if ($this->isBlank($cells)) {
                continue;
            }
            yield $number => $cells;
        }
    }

    /** @return Generator<int, list<string|null>> */
    private function iterate(ReaderInterface $reader): Generator
    {
        foreach ($reader->getSheetIterator() as $sheet) {
            $line = 0;
            foreach ($sheet->getRowIterator() as $row) {
                $line++;
                $cells = [];
                foreach (array_slice($row->getCells(), 0, self::MAX_COLUMNS) as $cell) {
                    $cells[] = $this->cellToString($cell);
                }
                yield $line => $cells;
            }

            return; // first worksheet only
        }
    }

    private function cellToString(Cell $cell): ?string
    {
        if ($cell instanceof ErrorCell) {
            return null;
        }
        $value = $cell instanceof FormulaCell ? $cell->getComputedValue() : $cell->getValue();

        $string = match (true) {
            $value === null => null,
            is_bool($value) => $value ? '1' : '0',
            is_int($value) => (string) $value,
            is_float($value) => self::floatToString($value),
            $value instanceof DateTimeInterface => $value->format('H:i:s') === '00:00:00' ? $value->format('Y-m-d') : $value->format('Y-m-d H:i:s'),
            $value instanceof DateInterval => null,
            default => (string) $value,
        };

        if ($string === null) {
            return null;
        }
        // Strip the invisible characters Excel and Arabic keyboards leave behind.
        $string = preg_replace('/[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}\x{00A0}]/u', ' ', $string) ?? $string;

        return mb_substr($string, 0, self::MAX_CELL_LENGTH);
    }

    /** Print a float the way a spreadsheet user typed it (no binary noise, no exponent). */
    public static function floatToString(float $value): string
    {
        if (! is_finite($value)) {
            return '';
        }
        if (floor($value) === $value && abs($value) < 1e15) {
            return sprintf('%.0f', $value);
        }
        $string = rtrim(rtrim(sprintf('%.10F', round($value, 10)), '0'), '.');

        return $string === '-0' ? '0' : $string;
    }

    /**
     * Convert the CSV to a UTF-8 temp file and detect its delimiter.
     *
     * @return array{0: string, 1: string} [temp path, delimiter]
     */
    private function prepareCsv(string $path): array
    {
        $content = @file_get_contents($path);
        if ($content === false) {
            throw DomainException::because('imports.errors.unreadable', [], 'file');
        }
        $content = self::toUtf8($content);
        // Classic Mac line endings (lone CR) are normalised; CRLF is handled by the reader.
        $content = preg_replace("/\r(?!\n)/", "\n", $content) ?? $content;

        $temp = tempnam(sys_get_temp_dir(), 'ev-imp-');
        if ($temp === false || file_put_contents($temp, $content) === false) {
            throw new \RuntimeException('Could not create a temporary file.');
        }

        return [$temp, self::detectDelimiter($content)];
    }

    /** UTF-8 (BOM stripped) from UTF-8, UTF-16 (with BOM) or Windows-1256 bytes. */
    public static function toUtf8(string $content): string
    {
        if (str_starts_with($content, "\xEF\xBB\xBF")) {
            return substr($content, 3);
        }
        if (str_starts_with($content, "\xFF\xFE")) {
            return (string) mb_convert_encoding(substr($content, 2), 'UTF-8', 'UTF-16LE');
        }
        if (str_starts_with($content, "\xFE\xFF")) {
            return (string) mb_convert_encoding(substr($content, 2), 'UTF-8', 'UTF-16BE');
        }
        if (mb_check_encoding($content, 'UTF-8')) {
            return $content;
        }
        // Arabic Windows ("ANSI") exports: Windows-1256. Unknown bytes are dropped rather than failing the file.
        $converted = @iconv('WINDOWS-1256', 'UTF-8//IGNORE', $content);

        return $converted === false ? (string) mb_convert_encoding($content, 'UTF-8', 'UTF-8') : $converted;
    }

    /** The most frequent of `,` `;` and tab outside quotes in the first non-empty line (default `,`). */
    public static function detectDelimiter(string $content): string
    {
        $line = '';
        foreach (preg_split('/\n/', $content, 50) ?: [] as $candidate) {
            if (trim($candidate) !== '') {
                $line = $candidate;
                break;
            }
        }
        $line = preg_replace('/"[^"]*"/', '', $line) ?? $line;
        $counts = [',' => substr_count($line, ','), ';' => substr_count($line, ';'), "\t" => substr_count($line, "\t")];
        arsort($counts);
        $best = array_key_first($counts);

        return $counts[$best] > 0 ? $best : ',';
    }

    private function cleanup(?string $temp): void
    {
        if ($temp !== null && is_file($temp)) {
            @unlink($temp);
        }
    }
}
