<?php

namespace App\Modules\Vehicles\Models\Concerns;

/**
 * Vehicle master data keeps plain `name_ar` / `name_en` columns (no translation table).
 */
trait HasBilingualName
{
    public function name(?string $locale = null): string
    {
        $locale ??= app()->getLocale();
        $value = $this->getAttribute('name_'.$locale);
        if (is_string($value) && $value !== '') {
            return $value;
        }
        $fallback = $this->getAttribute('name_'.config('app.fallback_locale', 'en'));

        return is_string($fallback) && $fallback !== '' ? $fallback : (string) ($this->getAttribute('name_en') ?? $this->getAttribute('name_ar') ?? '');
    }
}
