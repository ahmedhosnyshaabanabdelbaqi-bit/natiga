<?php

namespace App\Modules\System\Services;

use App\Models\User;
use App\Support\Exceptions\DomainException;
use finfo;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Logo / dark logo / favicon uploads. Public assets: stored on the `public` disk under branding/ and the
 * URL path (/storage/branding/...) is saved into the setting. Real MIME is sniffed with finfo (never trust the
 * client), size is capped at 2MB. Requires `php artisan storage:link` on the server.
 */
final class BrandingUploads
{
    public const MAX_BYTES = 2 * 1024 * 1024;

    public const KEYS = ['branding.logo_path', 'branding.logo_dark_path', 'branding.favicon_path'];

    private const IMAGE_MIMES = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'];

    private const ICON_MIMES = ['image/x-icon' => 'ico', 'image/vnd.microsoft.icon' => 'ico'];

    public function store(string $key, UploadedFile $file, ?User $actor = null): string
    {
        if (! in_array($key, self::KEYS, true)) {
            throw DomainException::because('system.settings.errors.not_an_image_setting', ['key' => $key], 'file');
        }
        if (! $file->isValid() || $file->getSize() === false || $file->getSize() > self::MAX_BYTES) {
            throw DomainException::because('system.settings.errors.image_too_large', ['max' => '2MB'], 'file');
        }
        $allowed = $key === 'branding.favicon_path' ? self::IMAGE_MIMES + self::ICON_MIMES : self::IMAGE_MIMES;
        $mime = (string) (new finfo(FILEINFO_MIME_TYPE))->file($file->getRealPath());
        if (! isset($allowed[$mime])) {
            throw DomainException::because('system.settings.errors.image_type_not_allowed', ['types' => implode(', ', array_unique(array_values($allowed)))], 'file');
        }

        $name = Str::after($key, 'branding.').'-'.Str::lower(Str::random(12)).'.'.$allowed[$mime];
        $name = str_replace('_path', '', $name);
        $disk = Storage::disk('public');
        $stored = $disk->putFileAs('branding', $file, $name, ['visibility' => 'public']);
        if ($stored === false) {
            throw DomainException::because('system.settings.errors.upload_failed', [], 'file');
        }

        $previous = Settings::get($key);
        $path = '/storage/'.$stored;
        Settings::set($key, $path, $actor);
        $this->forget($previous);

        return $path;
    }

    public function forget(mixed $previous): void
    {
        if (is_string($previous) && str_starts_with($previous, '/storage/branding/')) {
            Storage::disk('public')->delete(Str::after($previous, '/storage/'));
        }
    }
}
