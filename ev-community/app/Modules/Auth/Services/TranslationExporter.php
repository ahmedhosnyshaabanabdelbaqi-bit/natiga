<?php

namespace App\Modules\Auth\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;

/**
 * Flattens lang/<locale>/*.php into { "module.key.sub": "text" } for the frontend `t()` helper.
 * Cached; invalidated by version (mtime hash) so deploys refresh it automatically.
 */
class TranslationExporter
{
    /** @return array<string, string> */
    public function forLocale(string $locale): array
    {
        $dir = lang_path($locale);
        $files = File::exists($dir) ? File::glob($dir.'/*.php') : [];
        $version = md5(implode('|', array_map(fn ($f) => $f.':'.File::lastModified($f), $files)));

        return Cache::rememberForever("ev.translations.{$locale}.{$version}", function () use ($files, $locale) {
            $out = [];
            foreach ($files as $file) {
                $namespace = pathinfo($file, PATHINFO_FILENAME);
                $this->flatten(require $file, $namespace, $out);
            }
            if (File::exists(lang_path($locale.'.json'))) {
                foreach (json_decode(File::get(lang_path($locale.'.json')), true) ?: [] as $k => $v) {
                    $out[$k] = $v;
                }
            }

            return $out;
        });
    }

    private function flatten(array $items, string $prefix, array &$out): void
    {
        foreach ($items as $key => $value) {
            $full = $prefix.'.'.$key;
            if (is_array($value)) {
                $this->flatten($value, $full, $out);
            } else {
                $out[$full] = (string) $value;
            }
        }
    }
}
