<?php

namespace App\Modules\Files\Models;

use App\Models\User;
use App\Support\Concerns\HasPublicId;
use Database\Factories\Files\AttachmentFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Carbon;

/**
 * A stored file (private by default). Files are only ever written through
 * AttachmentService and only ever read through the authorized download route.
 *
 * @property int $id
 * @property string $public_id
 * @property string|null $owner_type
 * @property int|null $owner_id
 * @property string $collection
 * @property string $storage_disk
 * @property string $storage_path
 * @property string $original_filename
 * @property string $mime_type
 * @property string $extension
 * @property int $size
 * @property string|null $checksum_sha256
 * @property string $visibility
 * @property array<string, string>|null $variants
 * @property array<string, mixed>|null $meta
 * @property int|null $uploaded_by
 * @property Carbon|null $scanned_at
 * @property string $scan_status
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Model|null $owner
 * @property-read User|null $uploader
 */
class Attachment extends Model
{
    /** @use HasFactory<AttachmentFactory> */
    use HasFactory, HasPublicId;

    public const COLLECTION_PENDING = 'pending_upload';

    public const VISIBILITY_PRIVATE = 'private';

    public const VISIBILITY_PUBLIC = 'public';

    /** Hours a pending (owner-less) upload is kept before the purge command removes it. */
    public const PENDING_TTL_HOURS = 24;

    protected $table = 'attachments';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'variants' => 'array',
            'meta' => 'array',
            'size' => 'int',
            'owner_id' => 'int',
            'uploaded_by' => 'int',
            'scanned_at' => 'datetime',
        ];
    }

    protected static function newFactory(): AttachmentFactory
    {
        return AttachmentFactory::new();
    }

    public function owner(): MorphTo
    {
        return $this->morphTo('owner', 'owner_type', 'owner_id');
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->whereNull('owner_id')->where('collection', self::COLLECTION_PENDING);
    }

    public function scopeInCollection(Builder $query, string $collection): Builder
    {
        return $query->where('collection', $collection);
    }

    public function isImage(): bool
    {
        return str_starts_with($this->mime_type, 'image/');
    }

    public function isPdf(): bool
    {
        return $this->mime_type === 'application/pdf';
    }

    public function isPublic(): bool
    {
        return $this->visibility === self::VISIBILITY_PUBLIC;
    }

    public function isPending(): bool
    {
        return $this->owner_id === null && $this->collection === self::COLLECTION_PENDING;
    }

    /** Storage path of a variant (thumb|medium|large) or null when it does not exist. */
    public function variantPath(?string $variant): ?string
    {
        if ($variant === null || $variant === '') {
            return null;
        }

        return $this->variants[$variant] ?? null;
    }

    /** @return string[] */
    public function allPaths(): array
    {
        return array_values(array_unique(array_filter([$this->storage_path, ...array_values($this->variants ?? [])])));
    }
}
