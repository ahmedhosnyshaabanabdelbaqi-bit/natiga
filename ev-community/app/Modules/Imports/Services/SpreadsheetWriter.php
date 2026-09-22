<?php

namespace App\Modules\Imports\Services;

use App\Modules\Imports\Models\Enums\ExportFormat;
use DateTimeInterface;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\CSV\Options as CsvOptions;
use OpenSpout\Writer\CSV\Writer as CsvWriter;
use OpenSpout\Writer\WriterInterface;
use OpenSpout\Writer\XLSX\Entity\SheetView;
use OpenSpout\Writer\XLSX\Writer as XlsxWriter;

/**
 * Writes CSV (UTF-8 with BOM so Excel shows Arabic correctly) or XLSX (right-to-left sheet for
 * Arabic) to a temp file. Every text cell is neutralised against spreadsheet formula injection.
 */
final class SpreadsheetWriter
{
    private WriterInterface $writer;

    private string $path;

    private bool $closed = false;

    public function __construct(private readonly ExportFormat $format, private readonly bool $rightToLeft = false)
    {
        $path = tempnam(sys_get_temp_dir(), 'ev-exp-');
        if ($path === false) {
            throw new \RuntimeException('Could not create a temporary file.');
        }
        $this->path = $path;

        if ($format === ExportFormat::Csv) {
            $options = new CsvOptions;
            $options->SHOULD_ADD_BOM = true;
            $this->writer = new CsvWriter($options);
            $this->writer->openToFile($this->path);
        } else {
            $this->writer = new XlsxWriter;
            $this->writer->openToFile($this->path);
            if ($rightToLeft) {
                $this->writer->getCurrentSheet()->setSheetView((new SheetView)->setRightToLeft(true));
            }
        }
    }

    /** @param list<string> $headers */
    public function header(array $headers): void
    {
        $values = array_map(fn ($h) => self::safe($h), $headers);
        $this->writer->addRow($this->format === ExportFormat::Xlsx ? Row::fromValues($values, (new Style)->setFontBold()) : Row::fromValues($values));
    }

    /** @param list<scalar|DateTimeInterface|null> $values */
    public function row(array $values): void
    {
        $this->writer->addRow(Row::fromValues(array_map(fn ($v) => self::safe($v), $values)));
    }

    /** Close the writer and return the file path (the caller deletes it). */
    public function finish(): string
    {
        if (! $this->closed) {
            $this->writer->close();
            $this->closed = true;
        }

        return $this->path;
    }

    public function discard(): void
    {
        try {
            $this->finish();
        } finally {
            @unlink($this->path);
        }
    }

    /**
     * Cell value safe for spreadsheets: strings starting with = + - @ (or tab/CR) are prefixed with an
     * apostrophe so Excel/LibreOffice never evaluate them as formulas (CSV injection). Plain numbers
     * such as "-12.50" stay numbers.
     */
    public static function safe(mixed $value): string|int|float|bool|null
    {
        if ($value === null || is_int($value) || is_float($value) || is_bool($value)) {
            return $value;
        }
        if ($value instanceof DateTimeInterface) {
            return $value->format('Y-m-d H:i:s');
        }
        $value = (string) $value;
        if ($value !== '' && preg_match('/^[=+\-@\t\r]/', $value) && ! is_numeric($value)) {
            return "'".$value;
        }

        return $value;
    }
}
