<?php

namespace App\Modules\Imports\Services;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Files\Models\Attachment;
use App\Modules\Files\Services\AttachmentService;
use App\Modules\Imports\Contracts\Importer;
use App\Modules\Imports\Exceptions\SkipRowException;
use App\Modules\Imports\Jobs\ProcessImportJob;
use App\Modules\Imports\Jobs\ValidateImportJob;
use App\Modules\Imports\Models\Enums\ExportFormat;
use App\Modules\Imports\Models\Enums\ImportRowStatus;
use App\Modules\Imports\Models\Enums\ImportStatus;
use App\Modules\Imports\Models\Import;
use App\Modules\Imports\Models\ImportRow;
use App\Modules\Reports\Operations\Services\OperationsExceptions;
use App\Modules\System\Services\Settings;
use App\Support\Exceptions\DomainException;
use App\Support\Sequence\NumberSequence;
use Closure;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Import pipeline: upload (CSV/XLSX) → mapping preview → validate (inline, or queued above
 * `imports.inline_validation_rows`) → confirm → ProcessImportJob (chunked, idempotent per row)
 * → final report. Cancel is possible until processing starts.
 *
 * Invariant checked when processing finishes:
 *   imported + rejected (invalid + failed) + skipped + duplicate == total_rows
 * A violation marks the import failed and raises an Exception Center entry.
 */
final class ImportService
{
    public const AUDIT_UPLOADED = 'imports.uploaded';

    public const AUDIT_CONFIRMED = 'imports.confirmed';

    public const AUDIT_COMPLETED = 'imports.completed';

    public const AUDIT_FAILED = 'imports.failed';

    public const AUDIT_CANCELLED = 'imports.cancelled';

    /** Pseudo column key for errors that concern the whole row. */
    public const ROW_ERROR = '_row';

    private const INSERT_BATCH = 500;

    /** Generated error reports are trusted server files: allow more than the upload ceiling. */
    private const MAX_REPORT_BYTES = 200 * 1024 * 1024;

    public function __construct(
        private readonly AttachmentService $attachments,
        private readonly AuditService $audit,
        private readonly SpreadsheetReader $reader,
    ) {}

    // ------------------------------------------------------------------ authorization

    public function canRun(Importer $importer, User $user): bool
    {
        return $user->can('imports.manage') && $user->can($importer->permission());
    }

    public function assertCanRun(Importer $importer, User $user): void
    {
        if (! $this->canRun($importer, $user)) {
            throw DomainException::forbidden();
        }
    }

    public function importerFor(Import $import): Importer
    {
        return $import->importer() ?? throw DomainException::because('imports.errors.importer_missing', ['type' => $import->type]);
    }

    // ------------------------------------------------------------------ upload & mapping

    /**
     * Parse the file, store its rows and the source file, and auto-map the headers.
     *
     * @param  array<string, mixed>  $importerOptions  importer-specific options (see ImportContext::options())
     */
    public function upload(string $type, UploadedFile $file, User $actor, array $importerOptions = []): Import
    {
        $importer = Importers::find($type);
        $this->assertCanRun($importer, $actor);

        $info = $this->attachments->inspect($file, 'spreadsheet');
        if (! in_array($info['extension'], SpreadsheetReader::FORMATS, true)) {
            throw DomainException::because('imports.errors.unsupported_format', ['formats' => implode(', ', SpreadsheetReader::FORMATS)], 'file');
        }
        $format = $info['extension'];
        $path = $file->getRealPath() ?: $file->getPathname();

        $opened = $this->reader->open($path, $format);
        if ($opened === null) {
            throw DomainException::because('imports.errors.no_header', [], 'file');
        }
        [$headers, $rows] = $opened;
        $headers = array_map(fn (string $h) => mb_substr($h, 0, 120), $headers);
        $mapping = ColumnMapper::autoMap($headers, $importer);
        $maxRows = max(1, Settings::int('imports.max_rows', 20000));
        $originalName = mb_substr(trim($file->getClientOriginalName()) !== '' ? $file->getClientOriginalName() : 'import.'.$format, 0, 255);

        return DB::transaction(function () use ($type, $importer, $file, $actor, $importerOptions, $format, $headers, $rows, $mapping, $maxRows, $originalName) {
            $import = Import::query()->create([
                'number' => NumberSequence::next('import'),
                'type' => $type,
                'status' => ImportStatus::Uploaded,
                'original_filename' => $originalName,
                'created_by' => $actor->id,
                'options' => [
                    'format' => $format,
                    'locale' => app()->getLocale(),
                    'headers' => $headers,
                    'mapping' => $mapping,
                    'importer' => $importerOptions,
                ],
            ]);

            $total = 0;
            $batch = [];
            foreach ($rows as $number => $cells) {
                if (++$total > $maxRows) {
                    throw DomainException::because('imports.errors.too_many_rows', ['max' => $maxRows], 'file');
                }
                $batch[] = [
                    'import_id' => $import->id,
                    'row_number' => $number,
                    'raw' => json_encode($cells, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
                    'status' => ImportRowStatus::Pending->value,
                ];
                if (count($batch) >= self::INSERT_BATCH) {
                    ImportRow::query()->insert($batch);
                    $batch = [];
                }
            }
            if ($batch !== []) {
                ImportRow::query()->insert($batch);
            }
            if ($total === 0) {
                throw DomainException::because('imports.errors.no_rows', [], 'file');
            }

            // Stored last: a failure above leaves nothing on disk.
            $source = $this->attachments->store($file, $import, Import::COLLECTION_SOURCE, Attachment::VISIBILITY_PRIVATE, 'spreadsheet', $actor);
            $import->forceFill([
                'file_attachment_id' => $source->id,
                'total_rows' => $total,
                'status' => ImportStatus::Parsed,
            ])->save();

            $this->audit->log(self::AUDIT_UPLOADED, $import, new: [
                'type' => $type,
                'file' => $originalName,
                'total_rows' => $total,
                'missing_required' => ColumnMapper::missingRequired($mapping, $importer),
            ], actor: $actor, entityLabel: $import->number);

            return $import;
        });
    }

    /**
     * Replace the column mapping (column key => header index|null). Resets an earlier validation.
     *
     * @param  array<string, mixed>  $mapping
     */
    public function applyMapping(Import $import, array $mapping, User $actor): Import
    {
        $importer = $this->importerFor($import);
        $this->assertCanRun($importer, $actor);

        $import = DB::transaction(function () use ($import, $mapping, $importer) {
            $import = $this->lock($import);
            if (! in_array($import->status, [ImportStatus::Parsed, ImportStatus::Validated], true)) {
                throw DomainException::conflict('imports.errors.invalid_state', ['status' => $import->status->label()]);
            }
            $clean = ColumnMapper::sanitize($mapping, $this->headers($import), $importer);
            $options = $import->options ?? [];
            $options['mapping'] = $clean;
            $import->forceFill(['options' => $options]);
            if ($import->status === ImportStatus::Validated) {
                $this->resetValidation($import);
            }
            $import->save();

            return $import;
        });

        $this->deleteErrorReport($import);

        return $import->refresh();
    }

    // ------------------------------------------------------------------ validation

    /** Start validation: inline for small files, ValidateImportJob above `imports.inline_validation_rows`. */
    public function validate(Import $import, User $actor): Import
    {
        $importer = $this->importerFor($import);
        $this->assertCanRun($importer, $actor);

        $started = false;
        $import = DB::transaction(function () use ($import, $importer, $actor, &$started) {
            $import = $this->lock($import);
            if ($import->status === ImportStatus::Validating) {
                return $import; // already running (double click / second tab)
            }
            $retryAfterFailure = $import->status === ImportStatus::Failed && ($import->summary['failed_stage'] ?? null) === 'validation';
            if (! in_array($import->status, [ImportStatus::Parsed, ImportStatus::Validated], true) && ! $retryAfterFailure) {
                throw DomainException::conflict('imports.errors.invalid_state', ['status' => $import->status->label()]);
            }
            $missing = ColumnMapper::missingRequired($this->mapping($import), $importer);
            if ($missing !== []) {
                $labels = $this->columnLabels($importer, app()->getLocale());
                throw DomainException::because('imports.errors.required_unmapped', ['columns' => implode('، ', array_map(fn ($k) => $labels[$k] ?? $k, $missing))], 'mapping');
            }
            $options = $import->options ?? [];
            $options['validated_by'] = $actor->id;
            $options['validation_run'] = strtolower((string) Str::ulid());
            $this->resetValidation($import);
            $summary = $import->summary ?? [];
            unset($summary['error'], $summary['error_params'], $summary['failed_stage']);
            $import->forceFill(['status' => ImportStatus::Validating, 'options' => $options, 'summary' => $summary, 'finished_at' => null])->save();
            $started = true;

            return $import;
        });

        if ($started) {
            $this->deleteErrorReport($import);
            if ($import->total_rows > max(0, Settings::int('imports.inline_validation_rows', 500))) {
                ValidateImportJob::dispatch($import->id);
            } else {
                $this->runValidation($import);
            }
        }

        return $import->refresh();
    }

    /**
     * Validation pass (inline, or sliced over ValidateImportJob runs when `$deadline` is given).
     *
     * Rows are validated in file order; a slice stops at the deadline and the in-file duplicate
     * tracker is parked in the cache together with the last validated row id. The next slice resumes
     * from there; when the parked state is missing or does not match the rows (worker crash, cache
     * flush) the pass restarts from the first row, so duplicates are never missed.
     *
     * @param  float|null  $deadline  microtime(true) after which the slice stops (null = run to the end)
     */
    public function runValidation(Import $import, ?float $deadline = null): Import
    {
        $import = $import->fresh() ?? $import;
        if ($import->status !== ImportStatus::Validating) {
            return $import;
        }
        $importer = $import->importer();
        if ($importer === null) {
            return $this->markFailed($import, 'validation', 'imports.errors.importer_missing', ['type' => $import->type]);
        }

        try {
            return $this->withLocale($this->locale($import), function () use ($import, $importer, $deadline) {
                $actor = isset($import->options['validated_by']) ? User::query()->find($import->options['validated_by']) : null;
                $ctx = new ImportContext($import, $importer, $actor, $this->locale($import));
                $mapping = $this->mapping($import);
                $stateKey = 'imports:validation:'.$import->id.':'.($import->options['validation_run'] ?? 'run');

                $lastDoneId = ImportRow::query()->where('import_id', $import->id)->where('status', '!=', ImportRowStatus::Pending->value)->max('id');
                if ($lastDoneId !== null) {
                    $state = Cache::get($stateKey);
                    if (is_array($state) && (int) ($state['last_id'] ?? 0) === (int) $lastDoneId && is_array($state['seen'] ?? null)) {
                        $ctx->restoreSeen($state['seen']);
                    } else {
                        $this->resetRows($import); // inconsistent partial run: start over
                    }
                }

                $stopped = false;
                $lastId = null;
                ImportRow::query()->where('import_id', $import->id)->where('status', ImportRowStatus::Pending->value)->orderBy('id')
                    ->chunkById(max(1, $importer->chunkSize()), function (Collection $rows) use ($import, $importer, $ctx, $mapping, $deadline, &$stopped, &$lastId) {
                        if (! $this->stillIn($import, ImportStatus::Validating)) {
                            $stopped = true;

                            return false;
                        }
                        $results = [];
                        foreach ($rows as $row) {
                            /** @var ImportRow $row */
                            $results[] = $this->validateRow($row, $importer, $ctx, $mapping);
                        }
                        $this->saveValidationResults($results);
                        $lastId = $rows->last()?->id;
                        if ($deadline !== null && microtime(true) >= $deadline) {
                            $stopped = true;

                            return false;
                        }

                        return true;
                    });

                if ($stopped) {
                    if ($lastId !== null && $this->stillIn($import, ImportStatus::Validating)) {
                        Cache::put($stateKey, ['last_id' => $lastId, 'seen' => $ctx->seenState()], now()->addDay());
                    }

                    return $import->refresh();
                }
                Cache::forget($stateKey);

                $counts = $this->counts($import);
                $done = DB::transaction(function () use ($import, $counts) {
                    $locked = $this->lock($import);
                    if ($locked->status !== ImportStatus::Validating || $counts['pending'] > 0) {
                        return false;
                    }
                    $summary = $locked->summary ?? [];
                    $summary['validation'] = [
                        'valid' => $counts['valid'],
                        'invalid' => $counts['invalid'],
                        'duplicate' => $counts['duplicate'],
                        'validated_at' => now()->toIso8601String(),
                    ];
                    $locked->forceFill([
                        'status' => ImportStatus::Validated,
                        'valid_rows' => $counts['valid'],
                        'invalid_rows' => $counts['invalid'],
                        'duplicate_rows' => $counts['duplicate'],
                        'imported_rows' => 0,
                        'skipped_rows' => 0,
                        'failed_rows' => 0,
                        'summary' => $summary,
                    ])->save();

                    return true;
                });

                if ($done) {
                    $this->writeErrorReport($import->refresh(), $importer);
                }

                return $import->refresh();
            });
        } catch (Throwable $e) {
            report($e);

            return $this->markFailed($import, 'validation', 'imports.errors.validation_crashed');
        }
    }

    /** Is there still work for a validation or processing slice? */
    public function hasPendingWork(Import $import): bool
    {
        $status = match ($import->status) {
            ImportStatus::Validating => ImportRowStatus::Pending,
            ImportStatus::Processing => ImportRowStatus::Valid,
            default => null,
        };

        return $status !== null && ImportRow::query()->where('import_id', $import->id)->where('status', $status->value)->exists();
    }

    /**
     * @param  array<string, int|null>  $mapping
     * @return array{id: int, normalized: string, status: string, errors: string|null}
     */
    private function validateRow(ImportRow $row, Importer $importer, ImportContext $ctx, array $mapping): array
    {
        $ctx->setRow($row->row_number);
        $normalized = $importer->normalizeRow(ColumnMapper::apply(array_values((array) $row->raw), $mapping));
        $errors = $importer->validateRow($normalized, $ctx);

        if ($errors !== []) {
            $status = ImportRowStatus::Invalid;
        } elseif ($importer->isDuplicate($normalized, $ctx)) {
            $status = ImportRowStatus::Duplicate;
            $errors = [self::ROW_ERROR => __('imports.validation.duplicate')];
        } else {
            $status = ImportRowStatus::Valid;
        }

        return [
            'id' => $row->id,
            'normalized' => (string) json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
            'status' => $status->value,
            'errors' => $errors === [] ? null : (string) json_encode($errors, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
        ];
    }

    /**
     * One UPDATE ... FROM (VALUES ...) per chunk on PostgreSQL (row-by-row elsewhere).
     *
     * @param  list<array{id: int, normalized: string, status: string, errors: string|null}>  $results
     */
    private function saveValidationResults(array $results): void
    {
        if ($results === []) {
            return;
        }
        if (DB::getDriverName() !== 'pgsql') {
            foreach ($results as $result) {
                ImportRow::query()->whereKey($result['id'])->update(['normalized' => $result['normalized'], 'status' => $result['status'], 'errors' => $result['errors']]);
            }

            return;
        }
        $values = [];
        $bindings = [];
        foreach ($results as $result) {
            $values[] = '(?, ?, ?, ?)';
            array_push($bindings, $result['id'], $result['normalized'], $result['status'], $result['errors']);
        }
        DB::update(
            'UPDATE import_rows AS r SET normalized = v.normalized::jsonb, status = v.status, errors = v.errors::jsonb, entity_type = NULL, entity_id = NULL, processed_at = NULL '
            .'FROM (VALUES '.implode(', ', $values).') AS v(id, normalized, status, errors) '
            .'WHERE r.id = v.id::bigint AND r.status = \''.ImportRowStatus::Pending->value.'\'',
            $bindings,
        );
    }

    // ------------------------------------------------------------------ confirm & processing

    /** Confirm a validated import: status → processing and ProcessImportJob is queued. Idempotent. */
    public function confirm(Import $import, User $actor): Import
    {
        $importer = $this->importerFor($import);
        $this->assertCanRun($importer, $actor);

        $dispatch = false;
        $import = DB::transaction(function () use ($import, $actor, &$dispatch) {
            $import = $this->lock($import);
            if (in_array($import->status, [ImportStatus::Processing, ImportStatus::Completed], true)) {
                return $import; // repeated click / second tab: one processing run only
            }
            if ($import->status !== ImportStatus::Validated) {
                throw DomainException::conflict('imports.errors.invalid_state', ['status' => $import->status->label()]);
            }
            if ($import->valid_rows < 1) {
                throw DomainException::because('imports.errors.nothing_to_import');
            }
            $options = $import->options ?? [];
            $options['confirmed_by'] = $actor->id;
            $import->forceFill(['status' => ImportStatus::Processing, 'started_at' => now(), 'options' => $options])->save();
            $this->audit->log(self::AUDIT_CONFIRMED, $import, old: ['status' => ImportStatus::Validated->value], new: [
                'status' => ImportStatus::Processing->value,
                'valid_rows' => $import->valid_rows,
            ], actor: $actor, entityLabel: $import->number);
            $dispatch = true;

            return $import;
        });

        if ($dispatch) {
            ProcessImportJob::dispatch($import->id);
        }

        return $import->refresh();
    }

    /**
     * Processing pass (ProcessImportJob). Each valid row is imported in its own transaction under a
     * row lock and only while it is still `valid`, so retries never import a row twice.
     */
    /**
     * @param  float|null  $deadline  microtime(true) after which the slice stops; ProcessImportJob then
     *                                queues a continuation (rows left `valid` are picked up next time)
     */
    public function runProcessing(Import $import, ?float $deadline = null): Import
    {
        $import = $import->fresh() ?? $import;
        if ($import->status !== ImportStatus::Processing) {
            return $import;
        }
        $importer = $import->importer();
        if ($importer === null) {
            return $this->markFailed($import, 'processing', 'imports.errors.importer_missing', ['type' => $import->type]);
        }

        return $this->withLocale($this->locale($import), function () use ($import, $importer, $deadline) {
            $actor = isset($import->options['confirmed_by']) ? User::query()->find($import->options['confirmed_by']) : null;
            $ctx = new ImportContext($import, $importer, $actor, $this->locale($import));
            $stopped = false;

            ImportRow::query()->where('import_id', $import->id)->where('status', ImportRowStatus::Valid->value)->orderBy('id')
                ->chunkById(max(1, $importer->chunkSize()), function (Collection $rows) use ($import, $importer, $ctx, $deadline, &$stopped) {
                    if (! $this->stillIn($import, ImportStatus::Processing)) {
                        $stopped = true;

                        return false;
                    }
                    foreach ($rows as $row) {
                        /** @var ImportRow $row */
                        $this->processRow($row, $importer, $ctx);
                    }
                    $this->storeCounts($import, $this->counts($import));
                    if ($deadline !== null && microtime(true) >= $deadline) {
                        $stopped = true;

                        return false;
                    }

                    return true;
                });

            if ($stopped) {
                return $import->refresh();
            }

            return $this->finish($import, $importer, $actor);
        });
    }

    private function processRow(ImportRow $row, Importer $importer, ImportContext $ctx): void
    {
        $ctx->setRow($row->row_number);
        $normalized = (array) ($row->normalized ?? []);

        try {
            DB::transaction(function () use ($row, $importer, $ctx, $normalized) {
                $locked = ImportRow::query()->whereKey($row->id)->lockForUpdate()->first();
                if ($locked === null || $locked->status !== ImportRowStatus::Valid) {
                    return; // handled by an earlier (retried) run
                }
                // The data may have changed since validation (another import, a manual entry...).
                if ($importer->isDuplicate($normalized, $ctx)) {
                    $locked->forceFill([
                        'status' => ImportRowStatus::Duplicate,
                        'errors' => [self::ROW_ERROR => __('imports.validation.duplicate_now')],
                        'processed_at' => now(),
                    ])->save();

                    return;
                }
                $model = $importer->importRow($normalized, $ctx);
                $entity = $model !== null ? ['type' => $model->getMorphClass(), 'id' => $model->getKey()] : $ctx->takeEntity();
                $locked->forceFill([
                    'status' => ImportRowStatus::Imported,
                    'errors' => null,
                    'entity_type' => $entity !== null ? mb_substr((string) $entity['type'], 0, 120) : null,
                    'entity_id' => $entity !== null && is_numeric($entity['id']) ? (int) $entity['id'] : null,
                    'processed_at' => now(),
                ])->save();
            });
        } catch (SkipRowException $e) {
            $this->markRow($row, ImportRowStatus::Skipped, [self::ROW_ERROR => $e->getMessage()]);
        } catch (DomainException $e) {
            $field = $e->field !== null && array_key_exists($e->field, $normalized) ? $e->field : self::ROW_ERROR;
            $this->markRow($row, ImportRowStatus::Failed, [$field => $e->getMessage()]);
        } catch (ValidationException $e) {
            $errors = [];
            foreach ($e->errors() as $field => $messages) {
                $errors[array_key_exists($field, $normalized) ? $field : self::ROW_ERROR] = (string) ($messages[0] ?? $e->getMessage());
            }
            $this->markRow($row, ImportRowStatus::Failed, $errors ?: [self::ROW_ERROR => $e->getMessage()]);
        } catch (Throwable $e) {
            report($e);
            $this->markRow($row, ImportRowStatus::Failed, [self::ROW_ERROR => __('imports.errors.row_failed')]);
        }
    }

    /** @param array<string, string> $errors */
    private function markRow(ImportRow $row, ImportRowStatus $status, array $errors): void
    {
        ImportRow::query()->whereKey($row->id)->where('status', ImportRowStatus::Valid->value)->update([
            'status' => $status->value,
            'errors' => json_encode($errors, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
            'processed_at' => now(),
        ]);
    }

    private function finish(Import $import, Importer $importer, ?User $actor): Import
    {
        $counts = $this->counts($import);
        $remaining = $counts['valid'] + $counts['pending'];
        $accounted = $counts['imported'] + $counts['invalid'] + $counts['failed'] + $counts['skipped'] + $counts['duplicate'];

        $result = DB::transaction(function () use ($import, $counts, $remaining, $accounted) {
            $locked = $this->lock($import);
            if ($locked->status !== ImportStatus::Processing) {
                return null;
            }
            $invariant = $remaining === 0 && $accounted === $locked->total_rows;
            $summary = $locked->summary ?? [];
            $summary['result'] = [
                'imported' => $counts['imported'],
                'rejected' => $counts['invalid'] + $counts['failed'],
                'skipped' => $counts['skipped'],
                'duplicate' => $counts['duplicate'],
                'total' => $locked->total_rows,
                'invariant_holds' => $invariant,
                'duration_seconds' => $locked->started_at ? (int) $locked->started_at->diffInSeconds(now(), true) : null,
            ];
            if (! $invariant) {
                $summary['error'] = 'imports.errors.invariant_violated';
                $summary['failed_stage'] = 'processing';
            }
            $locked->forceFill([
                'imported_rows' => $counts['imported'],
                'invalid_rows' => $counts['invalid'],
                'failed_rows' => $counts['failed'],
                'skipped_rows' => $counts['skipped'],
                'duplicate_rows' => $counts['duplicate'],
                'status' => $invariant ? ImportStatus::Completed : ImportStatus::Failed,
                'finished_at' => now(),
                'summary' => $summary,
            ])->save();

            return [$locked, $invariant];
        });

        if ($result === null) {
            return $import->refresh();
        }
        [$import, $invariant] = $result;

        $this->writeErrorReport($import, $importer);
        $this->audit->log($invariant ? self::AUDIT_COMPLETED : self::AUDIT_FAILED, $import, new: $import->summary['result'] ?? [], actor: $actor, entityLabel: $import->number);

        if (! $invariant) {
            Log::error('imports.invariant_violated', ['import' => $import->number, 'counts' => $counts, 'total' => $import->total_rows]);
            if (class_exists(OperationsExceptions::class)) {
                try {
                    app(OperationsExceptions::class)->raise('data_quality', 'p2', 'Import '.$import->number.' row counts do not add up', [
                        'import' => $import->number,
                        'counts' => $counts,
                        'total_rows' => $import->total_rows,
                    ], 'imports:invariant:'.$import->id, 'imports');
                } catch (Throwable $e) {
                    report($e);
                }
            }
        }

        return $import->refresh();
    }

    // ------------------------------------------------------------------ cancel & failure

    public function cancel(Import $import, User $actor, ?string $reason = null): Import
    {
        $importer = $import->importer();
        if ($importer !== null) {
            $this->assertCanRun($importer, $actor);
        } elseif (! $actor->can('imports.manage')) {
            throw DomainException::forbidden();
        }

        return DB::transaction(function () use ($import, $actor, $reason) {
            $import = $this->lock($import);
            if ($import->status === ImportStatus::Cancelled) {
                return $import;
            }
            if (! $import->status->canCancel()) {
                throw DomainException::conflict('imports.errors.cannot_cancel', ['status' => $import->status->label()]);
            }
            $old = $import->status->value;
            $import->forceFill(['status' => ImportStatus::Cancelled, 'finished_at' => now()])->save();
            $this->audit->log(self::AUDIT_CANCELLED, $import, old: ['status' => $old], new: ['status' => ImportStatus::Cancelled->value], reason: $reason, actor: $actor, entityLabel: $import->number);

            return $import;
        });
    }

    /** Mark the import failed (job crash, importer missing...). The message key is translated for display. */
    public function markFailed(Import $import, string $stage, string $messageKey, array $params = []): Import
    {
        $changed = DB::transaction(function () use ($import, $stage, $messageKey, $params) {
            $locked = $this->lock($import);
            if ($locked->status->isTerminal()) {
                return false;
            }
            $summary = $locked->summary ?? [];
            $summary['error'] = $messageKey;
            $summary['error_params'] = $params;
            $summary['failed_stage'] = $stage;
            $locked->forceFill(['status' => ImportStatus::Failed, 'finished_at' => now(), 'summary' => $summary])->save();

            return true;
        });

        if ($changed) {
            $this->storeCounts($import, $this->counts($import));
            $this->audit->log(self::AUDIT_FAILED, $import->refresh(), new: ['stage' => $stage, 'error' => $messageKey], entityLabel: $import->number);
        }

        return $import->refresh();
    }

    // ------------------------------------------------------------------ reports & helpers

    /** Header template for an importer (labels in `$locale`). Returns a temp file path the caller deletes. */
    public function template(Importer $importer, ExportFormat $format, string $locale): string
    {
        $writer = new SpreadsheetWriter($format, $locale === 'ar' && $format === ExportFormat::Xlsx);
        $writer->header(array_values($this->columnLabels($importer, $locale)));

        return $writer->finish();
    }

    /**
     * Error report CSV: the original columns (fix and re-upload it as is) followed by row number,
     * status and messages, for invalid/duplicate/skipped/failed rows. Replaces the previous report.
     */
    public function writeErrorReport(Import $import, Importer $importer): ?Attachment
    {
        $reported = array_map(fn (ImportRowStatus $s) => $s->value, ImportRowStatus::reported());
        $query = ImportRow::query()->where('import_id', $import->id)->whereIn('status', $reported);
        if (! (clone $query)->exists()) {
            $this->deleteErrorReport($import);

            return null;
        }

        $locale = $this->locale($import);
        $headers = $this->headers($import);
        $labels = $this->columnLabels($importer, $locale);
        $writer = new SpreadsheetWriter(ExportFormat::Csv);
        try {
            $this->withLocale($locale, function () use ($writer, $headers, $query, $labels) {
                $writer->header([...$headers, __('imports.report.row'), __('imports.report.status'), __('imports.report.errors')]);
                foreach ($query->orderBy('id')->lazyById(500) as $row) {
                    /** @var ImportRow $row */
                    $cells = array_slice(array_pad(array_values((array) $row->raw), count($headers), null), 0, count($headers));
                    $writer->row([...$cells, $row->row_number, $row->status->label(), self::errorText((array) ($row->errors ?? []), $labels)]);
                }
            });
            $path = $writer->finish();
        } catch (Throwable $e) {
            $writer->discard();
            throw $e;
        }

        try {
            $attachment = $this->attachments->storeFromPath($path, $import->number.'-errors.csv', $import, Import::COLLECTION_ERROR_REPORT, Attachment::VISIBILITY_PRIVATE, 'spreadsheet', null, self::MAX_REPORT_BYTES);
        } finally {
            @unlink($path);
        }

        $previous = $import->error_report_attachment_id;
        $import->forceFill(['error_report_attachment_id' => $attachment->id])->save();
        if ($previous !== null && $previous !== $attachment->id) {
            $old = Attachment::query()->find($previous);
            if ($old !== null) {
                $this->attachments->delete($old);
            }
        }

        return $attachment;
    }

    /**
     * "Column: message; ..." for one row.
     *
     * @param  array<string, string>  $errors
     * @param  array<string, string>  $labels
     */
    public static function errorText(array $errors, array $labels): string
    {
        $parts = [];
        foreach ($errors as $field => $message) {
            $parts[] = $field === self::ROW_ERROR || ! isset($labels[$field]) ? (string) $message : $labels[$field].': '.$message;
        }

        return implode('; ', $parts);
    }

    /** @return array<string, string> column key => label in `$locale` */
    public function columnLabels(Importer $importer, string $locale): array
    {
        $labels = [];
        foreach ($importer->columns() as $column) {
            $labels[$column['key']] = (string) ($column['label'][$locale] ?? $column['label']['en'] ?? $column['key']);
        }

        return $labels;
    }

    /** @return list<string> */
    public function headers(Import $import): array
    {
        return array_values(array_map('strval', (array) ($import->options['headers'] ?? [])));
    }

    /** @return array<string, int|null> */
    public function mapping(Import $import): array
    {
        $mapping = [];
        foreach ((array) ($import->options['mapping'] ?? []) as $key => $index) {
            $mapping[(string) $key] = is_numeric($index) ? (int) $index : null;
        }

        return $mapping;
    }

    public function locale(Import $import): string
    {
        $locale = (string) ($import->options['locale'] ?? config('ev.default_locale', 'ar'));

        return in_array($locale, ev_locales(), true) ? $locale : (string) config('ev.default_locale', 'ar');
    }

    /**
     * Row counts per status, every status present (0 when none).
     *
     * @return array<string, int>
     */
    public function counts(Import $import): array
    {
        $counts = array_fill_keys(array_map(fn (ImportRowStatus $s) => $s->value, ImportRowStatus::cases()), 0);
        $rows = ImportRow::query()->where('import_id', $import->id)->selectRaw('status, count(*) as aggregate')->groupBy('status')->pluck('aggregate', 'status');
        foreach ($rows as $status => $count) {
            $counts[(string) $status] = (int) $count;
        }

        return $counts;
    }

    /** @param array<string, int> $counts */
    private function storeCounts(Import $import, array $counts): void
    {
        Import::query()->whereKey($import->id)->update([
            'imported_rows' => $counts['imported'],
            'skipped_rows' => $counts['skipped'],
            'failed_rows' => $counts['failed'],
            'duplicate_rows' => $counts['duplicate'],
            'invalid_rows' => $counts['invalid'],
            'updated_at' => now(),
        ]);
    }

    private function resetRows(Import $import): void
    {
        ImportRow::query()->where('import_id', $import->id)->where('status', '!=', ImportRowStatus::Pending->value)->update([
            'status' => ImportRowStatus::Pending->value,
            'normalized' => null,
            'errors' => null,
            'entity_type' => null,
            'entity_id' => null,
            'processed_at' => null,
        ]);
    }

    /** Back to `parsed`: rows pending again, validation counts cleared (the caller saves the import). */
    private function resetValidation(Import $import): void
    {
        $this->resetRows($import);
        $summary = $import->summary ?? [];
        unset($summary['validation']);
        $import->forceFill([
            'status' => ImportStatus::Parsed,
            'valid_rows' => 0,
            'invalid_rows' => 0,
            'duplicate_rows' => 0,
            'summary' => $summary,
        ]);
    }

    private function deleteErrorReport(Import $import): void
    {
        $id = $import->error_report_attachment_id;
        if ($id === null) {
            return;
        }
        Import::query()->whereKey($import->id)->update(['error_report_attachment_id' => null]);
        $import->error_report_attachment_id = null;
        $attachment = Attachment::query()->find($id);
        if ($attachment !== null) {
            $this->attachments->delete($attachment);
        }
    }

    private function lock(Import $import): Import
    {
        return Import::query()->whereKey($import->id)->lockForUpdate()->firstOrFail();
    }

    private function stillIn(Import $import, ImportStatus $status): bool
    {
        return Import::query()->whereKey($import->id)->where('status', $status->value)->exists();
    }

    /**
     * @template T
     *
     * @param  Closure(): T  $callback
     * @return T
     */
    private function withLocale(string $locale, Closure $callback): mixed
    {
        $previous = app()->getLocale();
        app()->setLocale($locale);
        try {
            return $callback();
        } finally {
            app()->setLocale($previous);
        }
    }
}
