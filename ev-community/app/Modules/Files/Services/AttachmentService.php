<?php

namespace App\Modules\Files\Services;

use App\Models\User;
use App\Modules\Files\Exceptions\InvalidUploadException;
use App\Modules\Files\Models\Attachment;
use App\Modules\System\Services\Settings;
use App\Support\Exceptions\DomainException;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\File;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Intervention\Image\ImageManager;
use InvalidArgumentException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;
use ZipArchive;

/**
 * The only way files enter and leave the platform.
 *
 *  - MIME is sniffed with finfo (extensions are never trusted), extensions are whitelisted per kind,
 *  - sizes are capped by config ceilings AND operator settings (files.max_image_mb / files.max_document_mb),
 *  - files get random storage names `{yyyy}/{mm}/{ulid}.{ext}` on the private disk (or the public disk),
 *  - images get webp variants thumb(320)/medium(800)/large(1600),
 *  - private files are only reachable through the authorized download route.
 */
final class AttachmentService
{
    public const KINDS = ['image', 'document', 'spreadsheet'];

    /** Variant name => maximum width in pixels (aspect ratio preserved, never upscaled). */
    public const VARIANTS = ['thumb' => 320, 'medium' => 800, 'large' => 1600];

    /** Decompression-bomb guard for variant generation (width × height). */
    public const MAX_IMAGE_PIXELS = 40_000_000;

    private const MIME_EXTENSIONS = [
        'image/jpeg' => ['jpg', 'jpeg'],
        'image/png' => ['png'],
        'image/webp' => ['webp'],
        'application/pdf' => ['pdf'],
        'text/csv' => ['csv'],
        'text/plain' => ['csv', 'txt'],
        'application/csv' => ['csv'],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => ['xlsx'],
    ];

    private const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    // ---------------------------------------------------------------- storing

    /**
     * Validate and store an uploaded file.
     *
     * @param  string  $visibility  private|public
     * @param  string  $kind  image|document|spreadsheet (selects the MIME/extension whitelist and the size limit)
     */
    public function store(UploadedFile $file, ?Model $owner, string $collection, string $visibility = Attachment::VISIBILITY_PRIVATE, string $kind = 'document', ?User $uploader = null): Attachment
    {
        if (! $file->isValid()) {
            throw InvalidUploadException::reason('upload_failed');
        }

        return $this->storeFromPath($file->getRealPath() ?: $file->getPathname(), $file->getClientOriginalName(), $owner, $collection, $visibility, $kind, $uploader);
    }

    /**
     * Store server-generated content (PDF receipts, export files, error reports...).
     * The same safety checks apply, so generated files must still be of an allowed type.
     */
    public function storeContents(string $contents, string $filename, ?Model $owner, string $collection, string $visibility = Attachment::VISIBILITY_PRIVATE, string $kind = 'document', ?User $uploader = null): Attachment
    {
        $temp = tempnam(sys_get_temp_dir(), 'ev-att-');
        if ($temp === false) {
            throw new \RuntimeException('Could not create a temporary file.');
        }
        try {
            file_put_contents($temp, $contents);

            return $this->storeFromPath($temp, $filename, $owner, $collection, $visibility, $kind, $uploader);
        } finally {
            @unlink($temp);
        }
    }

    /**
     * Core storing routine shared by uploads and generated files.
     */
    public function storeFromPath(string $sourcePath, string $originalName, ?Model $owner, string $collection, string $visibility = Attachment::VISIBILITY_PRIVATE, string $kind = 'document', ?User $uploader = null): Attachment
    {
        if (! in_array($visibility, [Attachment::VISIBILITY_PRIVATE, Attachment::VISIBILITY_PUBLIC], true)) {
            throw new InvalidArgumentException("Unknown visibility [{$visibility}]");
        }
        $collection = $this->sanitizeCollection($collection);
        $info = $this->inspect($sourcePath, $kind, $originalName);

        $diskName = $this->diskNameFor($visibility);
        $disk = Storage::disk($diskName);
        $directory = now()->format('Y/m');
        $ulid = strtolower((string) Str::ulid());
        $storageName = $ulid.'.'.$info['extension'];
        $storedPaths = [];

        try {
            $stored = $disk->putFileAs($directory, new File($sourcePath), $storageName);
            if ($stored === false) {
                throw new \RuntimeException('The storage disk refused the file.');
            }
            $storagePath = $directory.'/'.$storageName;
            $storedPaths[] = $storagePath;

            $meta = [];
            $variants = null;
            if (str_starts_with($info['mime'], 'image/')) {
                [$meta, $variants] = $this->generateImageVariants($disk, $sourcePath, $directory, $ulid);
                foreach ($variants ?? [] as $path) {
                    $storedPaths[] = $path;
                }
            }

            return Attachment::query()->create([
                'owner_type' => $owner?->getMorphClass(),
                'owner_id' => $owner?->getKey(),
                'collection' => $collection,
                'storage_disk' => $diskName,
                'storage_path' => $storagePath,
                'original_filename' => $this->sanitizeFilename($originalName, $info['extension']),
                'mime_type' => $info['mime'],
                'extension' => $info['extension'],
                'size' => $info['size'],
                'checksum_sha256' => hash_file('sha256', $sourcePath) ?: null,
                'visibility' => $visibility,
                'variants' => $variants,
                'meta' => $meta === [] ? null : $meta,
                'uploaded_by' => $uploader?->id,
                'scan_status' => 'not_scanned',
            ]);
        } catch (Throwable $e) {
            foreach ($storedPaths as $path) {
                try {
                    $disk->delete($path);
                } catch (Throwable) {
                    // best effort cleanup
                }
            }
            throw $e;
        }
    }

    // ------------------------------------------------------------- inspecting

    /**
     * Run every safety check without storing anything. Used by the SafeUpload rule and by store().
     *
     * @return array{mime: string, extension: string, size: int}
     *
     * @throws InvalidUploadException
     */
    public function inspect(UploadedFile|string $file, string $kind, ?string $clientName = null): array
    {
        if (! in_array($kind, self::KINDS, true)) {
            throw new InvalidArgumentException("Unknown upload kind [{$kind}]");
        }

        if ($file instanceof UploadedFile) {
            if (! $file->isValid()) {
                throw InvalidUploadException::reason('upload_failed');
            }
            $clientName ??= $file->getClientOriginalName();
            $path = $file->getRealPath() ?: $file->getPathname();
        } else {
            $path = $file;
        }

        if (! is_file($path) || ! is_readable($path)) {
            throw InvalidUploadException::reason('upload_failed');
        }

        $size = (int) filesize($path);
        if ($size <= 0) {
            throw InvalidUploadException::reason('empty');
        }

        $max = $this->maxBytes($kind);
        if ($size > $max) {
            throw InvalidUploadException::reason('too_large', ['max' => $this->megabytes($max)]);
        }

        $extension = strtolower(pathinfo((string) $clientName, PATHINFO_EXTENSION));
        if ($extension === '') {
            throw InvalidUploadException::reason('extension_missing');
        }
        $allowedExtensions = $this->allowedExtensions($kind);
        if (! in_array($extension, $allowedExtensions, true)) {
            throw InvalidUploadException::reason('extension_not_allowed', ['extension' => $extension, 'allowed' => implode(', ', $allowedExtensions)]);
        }

        $mime = $this->sniffMime($path, $extension);
        if (! in_array($mime, $this->allowedMimes($kind), true)) {
            throw InvalidUploadException::reason('mime_not_allowed', ['mime' => $mime]);
        }
        if (! in_array($extension, self::MIME_EXTENSIONS[$mime] ?? [], true)) {
            throw InvalidUploadException::reason('mime_mismatch', ['extension' => $extension]);
        }

        if (str_starts_with($mime, 'image/')) {
            $this->assertDecodableImage($path, $mime);
        }

        return ['mime' => $mime, 'extension' => $extension, 'size' => $size];
    }

    /** @return string[] */
    public function allowedMimes(string $kind): array
    {
        return array_values(config('ev.uploads.'.$kind.'_mimes', []));
    }

    /** @return string[] */
    public function allowedExtensions(string $kind): array
    {
        $extensions = [];
        foreach ($this->allowedMimes($kind) as $mime) {
            foreach (self::MIME_EXTENSIONS[$mime] ?? [] as $extension) {
                $extensions[$extension] = true;
            }
        }

        return array_keys($extensions);
    }

    /** Effective size ceiling in bytes: the lower of the config ceiling and the operator setting. */
    public function maxBytes(string $kind): int
    {
        $mb = 1024 * 1024;
        if ($kind === 'image') {
            $ceiling = (int) config('ev.uploads.max_image_bytes', 10 * $mb);
            $setting = Settings::int('files.max_image_mb', 10) * $mb;
        } else {
            $ceiling = (int) config('ev.uploads.max_document_bytes', 20 * $mb);
            $setting = Settings::int('files.max_document_mb', 20) * $mb;
        }

        return max(1, min($ceiling, $setting > 0 ? $setting : $ceiling));
    }

    public function maxMegabytes(string $kind): int
    {
        return $this->megabytes($this->maxBytes($kind));
    }

    // ---------------------------------------------------------------- reading

    public function url(Attachment $attachment, ?string $variant = null): string
    {
        if ($attachment->isPublic()) {
            $path = $variant ? ($attachment->variantPath($variant) ?? $attachment->storage_path) : $attachment->storage_path;

            return Storage::disk($attachment->storage_disk)->url($path);
        }

        return $this->downloadUrl($attachment, $variant);
    }

    public function downloadUrl(Attachment $attachment, ?string $variant = null): string
    {
        $params = ['attachment' => $attachment->public_id];
        if ($variant !== null && $attachment->variantPath($variant) !== null) {
            $params['variant'] = $variant;
        }

        return route('shared.files.download', $params);
    }

    /**
     * A short-lived direct URL when the disk supports it (S3 presigned URL), otherwise the
     * authorized download route (which still checks the policy on every request).
     */
    public function temporaryUrl(Attachment $attachment, int $minutes = 15, ?string $variant = null): string
    {
        $disk = Storage::disk($attachment->storage_disk);
        $path = $variant ? ($attachment->variantPath($variant) ?? $attachment->storage_path) : $attachment->storage_path;

        if ($disk->providesTemporaryUrls()) {
            try {
                return $disk->temporaryUrl($path, now()->addMinutes(max(1, $minutes)), [
                    'ResponseContentDisposition' => 'inline; filename="'.$this->asciiFilename($attachment->original_filename).'"',
                ]);
            } catch (Throwable $e) {
                report($e);
            }
        }

        return $this->downloadUrl($attachment, $variant);
    }

    /**
     * Stream the file (or one of its variants) with the right content type and disposition.
     * Authorization is the caller's job (AttachmentPolicy).
     */
    public function response(Attachment $attachment, ?string $variant = null): StreamedResponse
    {
        $disk = Storage::disk($attachment->storage_disk);

        if ($variant !== null && $variant !== '') {
            $path = $attachment->variantPath($variant);
            if ($path === null) {
                abort(404, __('files.errors.variant_missing'));
            }
            $mime = str_ends_with($path, '.webp') ? 'image/webp' : 'image/jpeg';
            $name = pathinfo($attachment->original_filename, PATHINFO_FILENAME).'-'.$variant.'.'.pathinfo($path, PATHINFO_EXTENSION);
        } else {
            $path = $attachment->storage_path;
            $mime = $attachment->mime_type;
            $name = $attachment->original_filename;
        }

        if (! $disk->exists($path)) {
            abort(404, __('files.errors.not_found'));
        }

        $inline = str_starts_with($mime, 'image/') || $mime === 'application/pdf';
        $headers = [
            'Content-Type' => $mime,
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => $inline ? 'private, max-age=300' : 'private, no-store',
        ];

        return $disk->response($path, $name, $headers, $inline ? 'inline' : 'attachment');
    }

    // --------------------------------------------------------------- mutating

    public function delete(Attachment $attachment): void
    {
        $disk = Storage::disk($attachment->storage_disk);
        foreach ($attachment->allPaths() as $path) {
            try {
                $disk->delete($path);
            } catch (Throwable $e) {
                Log::warning('files.delete_failed', ['attachment' => $attachment->public_id, 'path' => $path, 'error' => $e->getMessage()]);
            }
        }
        $attachment->delete();
    }

    /**
     * Attach a pending upload (made before the owner existed) to its owner.
     * When a claimant is given, only the uploader (or files.manage) may claim the file.
     */
    public function moveToOwner(Attachment $attachment, Model $owner, ?string $collection = null, ?User $claimant = null): Attachment
    {
        if ($claimant !== null && $attachment->uploaded_by !== $claimant->id && ! $claimant->can('files.manage')) {
            throw DomainException::forbidden('files.errors.not_owner_of_upload');
        }

        $sameOwner = $attachment->owner_type === $owner->getMorphClass() && (int) $attachment->owner_id === (int) $owner->getKey();
        if (! $attachment->isPending() && ! $sameOwner) {
            throw DomainException::because('files.errors.already_claimed', [], 'file');
        }

        $attachment->forceFill([
            'owner_type' => $owner->getMorphClass(),
            'owner_id' => $owner->getKey(),
            'collection' => $this->sanitizeCollection($collection ?? ($attachment->isPending() ? 'default' : $attachment->collection)),
        ])->save();

        return $attachment;
    }

    public function diskNameFor(string $visibility): string
    {
        return $visibility === Attachment::VISIBILITY_PUBLIC
            ? (string) config('filesystems.public_disk', 'public')
            : (string) config('filesystems.private_disk', 'private');
    }

    // --------------------------------------------------------------- internals

    private function sniffMime(string $path, string $extension): string
    {
        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = strtolower((string) ($finfo->file($path) ?: 'application/octet-stream'));
        $mime = explode(';', $mime)[0];

        // XLSX is a zip container; libmagic sometimes only sees the zip. Verify the workbook is inside.
        if ($extension === 'xlsx' && in_array($mime, ['application/zip', 'application/octet-stream', 'application/x-zip'], true) && $this->zipContains($path, 'xl/workbook.xml')) {
            return self::XLSX_MIME;
        }

        return $mime;
    }

    private function zipContains(string $path, string $entry): bool
    {
        $zip = new ZipArchive;
        if ($zip->open($path, ZipArchive::RDONLY) !== true) {
            return false;
        }
        try {
            return $zip->locateName($entry) !== false;
        } finally {
            $zip->close();
        }
    }

    private function assertDecodableImage(string $path, string $mime): void
    {
        $info = @getimagesize($path);
        if ($info === false || $info[0] < 1 || $info[1] < 1) {
            throw InvalidUploadException::reason('image_invalid');
        }
        $detected = strtolower((string) ($info['mime'] ?? ''));
        if ($detected !== '' && $detected !== $mime) {
            throw InvalidUploadException::reason('image_invalid');
        }
        if ($info[0] * $info[1] > self::MAX_IMAGE_PIXELS) {
            throw InvalidUploadException::reason('image_too_large', ['max' => (int) round(self::MAX_IMAGE_PIXELS / 1_000_000)]);
        }
    }

    /**
     * @return array{0: array<string, mixed>, 1: array<string, string>|null} [meta, variants]
     */
    private function generateImageVariants(Filesystem $disk, string $sourcePath, string $directory, string $ulid): array
    {
        $meta = [];
        $variants = [];
        try {
            $image = ImageManager::gd()->read($sourcePath);
            $meta = ['width' => $image->width(), 'height' => $image->height()];

            $webp = (bool) (gd_info()['WebP Support'] ?? false);
            // Largest first: scaleDown never upscales, so each step can reuse the previous result.
            foreach (array_reverse(self::VARIANTS, true) as $variant => $maxWidth) {
                $image->scaleDown(width: $maxWidth);
                $encoded = $webp ? $image->toWebp(quality: 82) : $image->toJpeg(quality: 85);
                $variantPath = sprintf('%s/%s_%s.%s', $directory, $ulid, $variant, $webp ? 'webp' : 'jpg');
                $disk->put($variantPath, (string) $encoded);
                $variants[$variant] = $variantPath;
            }
            ksort($variants);

            return [$meta, ['thumb' => $variants['thumb'], 'medium' => $variants['medium'], 'large' => $variants['large']]];
        } catch (Throwable $e) {
            // Variants are best effort: the original is still stored and served.
            report($e);
            foreach ($variants as $path) {
                try {
                    $disk->delete($path);
                } catch (Throwable) {
                }
            }

            return [$meta, null];
        }
    }

    private function sanitizeCollection(string $collection): string
    {
        $collection = strtolower(trim($collection));
        if ($collection === '' || ! preg_match('/^[a-z0-9_\-]{1,60}$/', $collection)) {
            throw new InvalidArgumentException("Invalid attachment collection [{$collection}]");
        }

        return $collection;
    }

    private function sanitizeFilename(string $name, string $extension): string
    {
        $base = pathinfo(trim($name), PATHINFO_FILENAME);
        $base = preg_replace('/[\x00-\x1F\x7F\/\\\\:*?"<>|]+/u', '', $base) ?? '';
        $base = trim(preg_replace('/\s+/u', ' ', $base) ?? '');
        if ($base === '' || $base === '.') {
            $base = 'file';
        }

        return mb_substr($base, 0, 200).'.'.$extension;
    }

    private function asciiFilename(string $name): string
    {
        $ascii = Str::ascii($name);
        $ascii = preg_replace('/[^A-Za-z0-9._\- ]+/', '_', $ascii) ?? 'file';

        return trim($ascii) === '' ? 'file' : $ascii;
    }

    private function megabytes(int $bytes): int
    {
        return (int) max(1, floor($bytes / (1024 * 1024)));
    }
}
