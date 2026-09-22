<?php

namespace App\Modules\Imports\Models;

use App\Models\User;
use App\Modules\Files\Concerns\HasAttachmentsTrait;
use App\Modules\Files\Contracts\HasAttachments;
use App\Modules\Files\Models\Attachment;
use App\Modules\Imports\Contracts\Importer;
use App\Modules\Imports\Models\Enums\ImportStatus;
use App\Modules\Imports\Services\Importers;
use App\Support\Concerns\HasPublicId;
use Database\Factories\Imports\ImportFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $public_id
 * @property string $number
 * @property string $type
 * @property ImportStatus $status
 * @property int|null $file_attachment_id
 * @property string $original_filename
 * @property int $total_rows
 * @property int $valid_rows
 * @property int $invalid_rows
 * @property int $duplicate_rows
 * @property int $imported_rows
 * @property int $skipped_rows
 * @property int $failed_rows
 * @property int|null $error_report_attachment_id
 * @property array<string, mixed>|null $options
 * @property int $created_by
 * @property Carbon|null $started_at
 * @property Carbon|null $finished_at
 * @property array<string, mixed>|null $summary
 * @property-read User $creator
 * @property-read Attachment|null $file
 * @property-read Attachment|null $errorReport
 */
class Import extends Model implements HasAttachments
{
    /** @use HasFactory<ImportFactory> */
    use HasAttachmentsTrait, HasFactory, HasPublicId;

    public const COLLECTION_SOURCE = 'import_source';

    public const COLLECTION_ERROR_REPORT = 'import_error_report';

    protected $table = 'imports';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'status' => ImportStatus::class,
            'options' => 'array',
            'summary' => 'array',
            'total_rows' => 'int',
            'valid_rows' => 'int',
            'invalid_rows' => 'int',
            'duplicate_rows' => 'int',
            'imported_rows' => 'int',
            'skipped_rows' => 'int',
            'failed_rows' => 'int',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    protected static function newFactory(): ImportFactory
    {
        return ImportFactory::new();
    }

    public function rows(): HasMany
    {
        return $this->hasMany(ImportRow::class)->orderBy('row_number');
    }

    public function file(): BelongsTo
    {
        return $this->belongsTo(Attachment::class, 'file_attachment_id');
    }

    public function errorReport(): BelongsTo
    {
        return $this->belongsTo(Attachment::class, 'error_report_attachment_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function attachmentViewableBy(User $user, Attachment $attachment): bool
    {
        return $user->id === $this->created_by || $user->can('imports.manage');
    }

    public function importer(): ?Importer
    {
        return Importers::get($this->type);
    }

    public function scopeOfType(Builder $query, string $type): Builder
    {
        return $query->where('type', $type);
    }

    public function scopeWithStatus(Builder $query, string $status): Builder
    {
        return $query->where('status', $status);
    }

    public function scopeSearch(Builder $query, string $term): Builder
    {
        $term = trim($term);

        return $query->where(fn (Builder $q) => $q->where('number', 'ILIKE', '%'.$term.'%')->orWhere('original_filename', 'ILIKE', '%'.$term.'%'));
    }

    /** Rows that will never be imported: invalid at validation time or failed while importing. */
    public function rejectedRows(): int
    {
        return $this->invalid_rows + $this->failed_rows;
    }

    /** Rows handled by the processing job so far. */
    public function processedRows(): int
    {
        return $this->imported_rows + $this->skipped_rows + $this->failed_rows;
    }

    public function progressPercent(): int
    {
        if ($this->status === ImportStatus::Processing || $this->status === ImportStatus::Completed) {
            $target = max(1, $this->valid_rows);

            return (int) min(100, round($this->processedRows() / $target * 100));
        }
        if ($this->status === ImportStatus::Validating) {
            $done = $this->rows()->where('status', '!=', 'pending')->count();

            return (int) min(100, round($done / max(1, $this->total_rows) * 100));
        }

        return $this->status === ImportStatus::Validated ? 100 : 0;
    }

    /** imported + rejected (invalid + failed) + skipped + duplicate == total (see ImportService::finish()). */
    public function countsInvariantHolds(): bool
    {
        return $this->imported_rows + $this->rejectedRows() + $this->skipped_rows + $this->duplicate_rows === $this->total_rows;
    }
}
