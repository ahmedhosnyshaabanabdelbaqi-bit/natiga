<?php

namespace App\Modules\Imports\Models;

use App\Models\User;
use App\Modules\Files\Concerns\HasAttachmentsTrait;
use App\Modules\Files\Contracts\HasAttachments;
use App\Modules\Files\Models\Attachment;
use App\Modules\Imports\Contracts\Exporter;
use App\Modules\Imports\Models\Enums\ExportFormat;
use App\Modules\Imports\Models\Enums\ExportStatus;
use App\Modules\Imports\Services\Exporters;
use App\Support\Concerns\HasPublicId;
use Database\Factories\Imports\ExportFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $public_id
 * @property string $number
 * @property string $type
 * @property ExportStatus $status
 * @property array<string, mixed>|null $filters
 * @property ExportFormat $format
 * @property int|null $row_count
 * @property int|null $file_attachment_id
 * @property int $created_by
 * @property string $locale
 * @property Carbon|null $expires_at
 * @property Carbon|null $started_at
 * @property Carbon|null $finished_at
 * @property array<string, mixed>|null $summary
 * @property-read User $creator
 * @property-read Attachment|null $file
 */
class Export extends Model implements HasAttachments
{
    /** @use HasFactory<ExportFactory> */
    use HasAttachmentsTrait, HasFactory, HasPublicId;

    public const COLLECTION_FILE = 'export_file';

    protected $table = 'exports';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'status' => ExportStatus::class,
            'format' => ExportFormat::class,
            'filters' => 'array',
            'summary' => 'array',
            'row_count' => 'int',
            'expires_at' => 'datetime',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    protected static function newFactory(): ExportFactory
    {
        return ExportFactory::new();
    }

    public function file(): BelongsTo
    {
        return $this->belongsTo(Attachment::class, 'file_attachment_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Export files contain data scoped to the requester: only the requester may download them. */
    public function attachmentViewableBy(User $user, Attachment $attachment): bool
    {
        return $user->id === $this->created_by && $this->isDownloadable();
    }

    public function exporter(): ?Exporter
    {
        return Exporters::get($this->type);
    }

    public function scopeForUser(Builder $query, User $user): Builder
    {
        return $query->where('created_by', $user->id);
    }

    public function isExpired(): bool
    {
        return $this->status === ExportStatus::Expired || ($this->expires_at !== null && $this->expires_at->isPast());
    }

    public function isDownloadable(): bool
    {
        return $this->status === ExportStatus::Completed && $this->file_attachment_id !== null && ! $this->isExpired();
    }
}
