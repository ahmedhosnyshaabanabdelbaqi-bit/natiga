<?php

namespace App\Modules\Imports\Http\Presenters;

use App\Modules\Files\Models\Attachment;
use App\Modules\Files\Services\AttachmentService;
use App\Modules\Imports\Contracts\Importer;
use App\Modules\Imports\Models\Enums\ImportStatus;
use App\Modules\Imports\Models\Import;
use App\Modules\Imports\Models\ImportRow;
use App\Modules\Imports\Services\ColumnMapper;
use App\Modules\Imports\Services\ImportService;

/**
 * Inertia props for the admin import pages (plain arrays; ids are public ULIDs).
 */
final class ImportPresenter
{
    public function __construct(
        private readonly ImportService $imports,
        private readonly AttachmentService $attachments,
    ) {}

    /** @return array<string, mixed> */
    public function summary(Import $import): array
    {
        $importer = $import->importer();

        return [
            'id' => $import->public_id,
            'number' => $import->number,
            'type' => $import->type,
            'type_label' => $importer !== null ? $this->localized($importer->label()) : $import->type,
            'status' => $import->status->value,
            'status_label' => $import->status->label(),
            'status_tone' => $import->status->tone(),
            'original_filename' => $import->original_filename,
            'total_rows' => $import->total_rows,
            'valid_rows' => $import->valid_rows,
            'invalid_rows' => $import->invalid_rows,
            'duplicate_rows' => $import->duplicate_rows,
            'imported_rows' => $import->imported_rows,
            'skipped_rows' => $import->skipped_rows,
            'failed_rows' => $import->failed_rows,
            'rejected_rows' => $import->rejectedRows(),
            'progress' => $import->progressPercent(),
            'busy' => $import->status->isBusy(),
            'created_by' => $import->creator?->name,
            'created_at' => $import->created_at?->toIso8601String(),
            'started_at' => $import->started_at?->toIso8601String(),
            'finished_at' => $import->finished_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    public function detail(Import $import, ?Importer $importer, bool $canManage): array
    {
        $headers = $this->imports->headers($import);
        $mapping = $this->imports->mapping($import);
        $summary = $import->summary ?? [];
        $status = $import->status;
        $retryValidation = $status === ImportStatus::Failed && ($summary['failed_stage'] ?? null) === 'validation';

        return $this->summary($import) + [
            'terminal' => $status->isTerminal(),
            'format' => (string) ($import->options['format'] ?? ''),
            'headers' => $headers,
            'mapping' => (object) $mapping,
            'columns' => $importer !== null ? $this->columns($importer) : [],
            'missing_required' => $importer !== null ? ColumnMapper::missingRequired($mapping, $importer) : [],
            'unmapped_headers' => ColumnMapper::unmappedHeaders($mapping, $headers),
            'source_file' => $this->file($import->file),
            'error_report' => $this->file($import->errorReport),
            'error' => isset($summary['error']) ? (string) __((string) $summary['error'], (array) ($summary['error_params'] ?? [])) : null,
            'validation' => $summary['validation'] ?? null,
            'result' => $summary['result'] ?? null,
            'can' => [
                'map' => $canManage && in_array($status, [ImportStatus::Parsed, ImportStatus::Validated], true),
                'validate' => $canManage && (in_array($status, [ImportStatus::Parsed, ImportStatus::Validated], true) || $retryValidation),
                'confirm' => $canManage && $status === ImportStatus::Validated && $import->valid_rows > 0,
                'cancel' => $canManage && $status->canCancel(),
            ],
        ];
    }

    /** @return list<array{key: string, label: string, required: bool, example: string|null}> */
    public function columns(Importer $importer): array
    {
        return array_map(fn (array $c) => [
            'key' => $c['key'],
            'label' => $this->localized($c['label']),
            'required' => (bool) $c['required'],
            'example' => $c['example'],
        ], $importer->columns());
    }

    /**
     * @param  array<string, string>  $labels
     * @param  array<string, int|null>  $mapping
     * @return array<string, mixed>
     */
    public function row(ImportRow $row, array $labels, array $mapping): array
    {
        $errors = [];
        foreach ((array) ($row->errors ?? []) as $field => $message) {
            $errors[] = [
                'field' => (string) $field,
                'label' => $field === ImportService::ROW_ERROR ? null : ($labels[$field] ?? (string) $field),
                'message' => (string) $message,
            ];
        }

        return [
            'id' => $row->id,
            'row_number' => $row->row_number,
            'status' => $row->status->value,
            'status_label' => $row->status->label(),
            'status_tone' => $row->status->tone(),
            'values' => (object) ColumnMapper::apply(array_values((array) $row->raw), $mapping),
            'errors' => $errors,
        ];
    }

    /** @return array{name: string, size: int, url: string}|null */
    public function file(?Attachment $attachment): ?array
    {
        if ($attachment === null) {
            return null;
        }

        return [
            'name' => $attachment->original_filename,
            'size' => $attachment->size,
            'url' => $this->attachments->downloadUrl($attachment),
        ];
    }

    /** @param array{ar?: string, en?: string} $pair */
    private function localized(array $pair): string
    {
        $locale = app()->getLocale();

        return (string) ($pair[$locale] ?? $pair['en'] ?? $pair['ar'] ?? '');
    }
}
