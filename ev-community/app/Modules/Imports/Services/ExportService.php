<?php

namespace App\Modules\Imports\Services;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Files\Models\Attachment;
use App\Modules\Files\Services\AttachmentService;
use App\Modules\Imports\Contracts\Exporter;
use App\Modules\Imports\Jobs\ProcessExportJob;
use App\Modules\Imports\Models\Enums\ExportFormat;
use App\Modules\Imports\Models\Enums\ExportStatus;
use App\Modules\Imports\Models\Export;
use App\Modules\System\Services\Settings;
use App\Support\Exceptions\DomainException;
use App\Support\Sequence\NumberSequence;
use Closure;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

/**
 * Exports: `request()` checks `exports.view` + the exporter's permission, validates the filters,
 * then generates inline (≤ `exports.inline_rows` rows) or queues ProcessExportJob. Files are private
 * attachments of the Export, downloadable only by the requester until `expires_at`
 * (`exports.retention_hours`, default 24 h); `exports:purge-expired` deletes them afterwards.
 * Headers and values use the requester's locale at request time.
 */
final class ExportService
{
    public const AUDIT_GENERATED = 'exports.generated';

    public const AUDIT_DOWNLOADED = 'exports.downloaded';

    public const AUDIT_FAILED = 'exports.failed';

    /** Export files are trusted server output: allow more than the upload ceiling. */
    private const MAX_FILE_BYTES = 500 * 1024 * 1024;

    /** Exports still queued/processing after this many hours are marked failed by the purge command. */
    public const STALLED_AFTER_HOURS = 6;

    public function __construct(
        private readonly AttachmentService $attachments,
        private readonly AuditService $audit,
    ) {}

    public function canRequest(Exporter $exporter, User $user): bool
    {
        return $user->can('exports.view') && $user->can($exporter->permission());
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public function request(string $type, array $filters, string $format, User $user): Export
    {
        $exporter = Exporters::find($type);
        if (! $this->canRequest($exporter, $user)) {
            throw DomainException::forbidden();
        }
        $exportFormat = ExportFormat::tryFrom($format) ?? throw DomainException::because('imports.errors.unknown_format', ['formats' => implode(', ', ExportFormat::values())], 'format');
        $filters = $this->validateFilters($exporter, $filters);

        $count = $this->baseQuery($exporter, $filters, $user)->reorder()->count();
        $max = max(1, Settings::int('exports.max_rows', 100000));
        if ($count > $max) {
            throw DomainException::because('imports.errors.export_too_large', ['count' => $count, 'max' => $max], 'filters');
        }

        $export = DB::transaction(fn () => Export::query()->create([
            'number' => NumberSequence::next('export'),
            'type' => $exporter->key(),
            'status' => ExportStatus::Queued,
            'filters' => $filters,
            'format' => $exportFormat,
            'created_by' => $user->id,
            'locale' => app()->getLocale(),
            'summary' => ['estimated_rows' => $count],
        ]));

        if ($count <= max(0, Settings::int('exports.inline_rows', 2000))) {
            return $this->generate($export);
        }
        ProcessExportJob::dispatch($export->id);

        return $export->refresh();
    }

    /**
     * Only the filters the exporter declares survive; values are validated with its rules.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function validateFilters(Exporter $exporter, array $filters): array
    {
        $rules = $exporter->filterRules();
        $filters = array_filter(
            array_intersect_key($filters, $rules),
            fn ($value) => $value !== null && $value !== '' && $value !== [],
        );
        $validator = Validator::make($filters, $rules);
        if ($validator->fails()) {
            $errors = [];
            foreach ($validator->errors()->messages() as $key => $messages) {
                $errors['filters.'.$key] = $messages;
            }
            throw ValidationException::withMessages($errors);
        }

        return $validator->validated();
    }

    /** Write the file (inline or from ProcessExportJob). Idempotent: only a queued export is generated. */
    public function generate(Export $export): Export
    {
        $claimed = DB::transaction(function () use ($export) {
            $locked = Export::query()->whereKey($export->id)->lockForUpdate()->first();
            if ($locked === null || $locked->status !== ExportStatus::Queued) {
                return false;
            }
            $locked->forceFill(['status' => ExportStatus::Processing, 'started_at' => now()])->save();

            return true;
        });
        if (! $claimed) {
            return $export->refresh();
        }
        $export->refresh();

        $exporter = $export->exporter();
        $creator = $export->creator;
        if ($exporter === null) {
            return $this->markFailed($export, 'imports.errors.unknown_export_type', ['type' => $export->type]);
        }
        if ($creator === null || ! $this->canRequest($exporter, $creator)) {
            return $this->markFailed($export, 'imports.errors.export_forbidden');
        }

        $writer = null;
        try {
            [$rowCount, $path] = $this->withLocale($export->locale, function () use ($export, $exporter, $creator, &$writer) {
                $writer = new SpreadsheetWriter($export->format, $export->locale === 'ar');
                $locale = $export->locale;
                $columns = $exporter->columns();
                $writer->header(array_map(fn (array $c) => (string) ($c['label'][$locale] ?? $c['label']['en'] ?? $c['key']), $columns));

                $rows = 0;
                foreach ($this->iterate($this->baseQuery($exporter, (array) ($export->filters ?? []), $creator)) as $record) {
                    $values = $exporter->row($record, $locale);
                    $writer->row(array_map(fn (array $c) => $values[$c['key']] ?? null, $columns));
                    $rows++;
                }

                return [$rows, $writer->finish()];
            });
        } catch (Throwable $e) {
            $writer?->discard();
            report($e);

            return $this->markFailed($export, 'imports.errors.export_failed');
        }

        try {
            $filename = $export->type.'-'.$export->number.'.'.$export->format->extension();
            $attachment = $this->attachments->storeFromPath($path, $filename, $export, Export::COLLECTION_FILE, Attachment::VISIBILITY_PRIVATE, 'spreadsheet', null, self::MAX_FILE_BYTES);
        } catch (Throwable $e) {
            report($e);

            return $this->markFailed($export, 'imports.errors.export_failed');
        } finally {
            @unlink($path);
        }

        $retention = max(1, Settings::int('exports.retention_hours', 24));
        $export->forceFill([
            'status' => ExportStatus::Completed,
            'row_count' => $rowCount,
            'file_attachment_id' => $attachment->id,
            'finished_at' => now(),
            'expires_at' => now()->addHours($retention),
        ])->save();

        $this->audit->log(self::AUDIT_GENERATED, $export, new: [
            'type' => $export->type,
            'format' => $export->format->value,
            'filters' => $export->filters,
            'row_count' => $rowCount,
        ], actor: $creator, entityLabel: $export->number);

        return $export->refresh();
    }

    /** Stream the file to its requester (authorization: ExportPolicy::download). */
    public function download(Export $export, User $user): StreamedResponse
    {
        $file = $export->file ?? throw DomainException::because('imports.errors.export_unavailable');
        $this->audit->log(self::AUDIT_DOWNLOADED, $export, new: ['type' => $export->type, 'row_count' => $export->row_count], actor: $user, entityLabel: $export->number);

        return $this->attachments->response($file);
    }

    public function markFailed(Export $export, string $messageKey, array $params = []): Export
    {
        $changed = Export::query()->whereKey($export->id)->whereIn('status', [ExportStatus::Queued->value, ExportStatus::Processing->value])
            ->update([
                'status' => ExportStatus::Failed->value,
                'finished_at' => now(),
                'summary' => json_encode(array_merge($export->summary ?? [], ['error' => $messageKey, 'error_params' => $params])),
                'updated_at' => now(),
            ]);
        $export->refresh();
        if ($changed === 1) {
            $this->audit->log(self::AUDIT_FAILED, $export, new: ['type' => $export->type, 'error' => $messageKey], actor: $export->creator, entityLabel: $export->number);
        }

        return $export;
    }

    /**
     * Delete the files of expired exports (status → expired) and fail exports stuck in the queue.
     *
     * @return array{expired: int, stalled: int}
     */
    public function purgeExpired(bool $dryRun = false): array
    {
        $expired = 0;
        $query = Export::query()->where('status', ExportStatus::Completed->value)->whereNotNull('expires_at')->where('expires_at', '<', now());
        if ($dryRun) {
            $expired = (clone $query)->count();
        } else {
            $query->orderBy('id')->chunkById(200, function ($exports) use (&$expired) {
                foreach ($exports as $export) {
                    /** @var Export $export */
                    $fileId = $export->file_attachment_id;
                    $export->forceFill(['status' => ExportStatus::Expired, 'file_attachment_id' => null])->save();
                    $file = $fileId !== null ? Attachment::query()->find($fileId) : null;
                    if ($file !== null) {
                        $this->attachments->delete($file);
                    }
                    $expired++;
                }
            });
        }

        $stalledQuery = Export::query()->whereIn('status', [ExportStatus::Queued->value, ExportStatus::Processing->value])
            ->where('updated_at', '<', now()->subHours(self::STALLED_AFTER_HOURS));
        $stalled = 0;
        if ($dryRun) {
            $stalled = (clone $stalledQuery)->count();
        } else {
            foreach ($stalledQuery->get() as $export) {
                $this->markFailed($export, 'imports.errors.export_stalled');
                $stalled++;
            }
        }

        return ['expired' => $expired, 'stalled' => $stalled];
    }

    /** @param array<string, mixed> $filters */
    private function baseQuery(Exporter $exporter, array $filters, User $user): EloquentBuilder|QueryBuilder
    {
        return $exporter->query($filters, $user);
    }

    /** @return iterable<object> */
    private function iterate(EloquentBuilder|QueryBuilder $query): iterable
    {
        if ($query instanceof EloquentBuilder) {
            $model = $query->getModel();

            return $query->reorder()->lazyById(1000, $model->getQualifiedKeyName(), $model->getKeyName());
        }

        return $query->reorder()->lazyById(1000, 'id');
    }

    /**
     * @template T
     *
     * @param  Closure(): T  $callback
     * @return T
     */
    private function withLocale(string $locale, Closure $callback): mixed
    {
        $locale = in_array($locale, ev_locales(), true) ? $locale : (string) config('ev.default_locale', 'ar');
        $previous = app()->getLocale();
        app()->setLocale($locale);
        try {
            return $callback();
        } finally {
            app()->setLocale($previous);
        }
    }
}
