<?php

namespace App\Support\Concerns;

use Illuminate\Support\Str;

/**
 * Adds an unguessable ULID `public_id` used in URLs and external references.
 * Route model binding resolves by public_id; internal joins keep using the bigint id.
 */
trait HasPublicId
{
    public static function bootHasPublicId(): void
    {
        static::creating(function ($model) {
            if (empty($model->public_id)) {
                $model->public_id = (string) Str::ulid();
            }
        });
    }

    public function getRouteKeyName(): string
    {
        return 'public_id';
    }

    public static function findByPublicId(string $publicId): ?static
    {
        return static::query()->where('public_id', $publicId)->first();
    }
}
