<?php

namespace App\Modules\System\Services;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\System\Models\SystemSetting;
use Illuminate\Support\Facades\Cache;

/**
 * Runtime settings with defaults from SettingsRegistry. Cached per key set.
 *
 *   Settings::get('branding.site_name_ar')      Settings::set('orders.deposit_percentage', 25, $actor)
 */
final class Settings
{
    private const CACHE_KEY = 'ev.settings.v1';

    /** @var array<string, mixed>|null */
    private static ?array $loaded = null;

    public static function get(string $key, mixed $default = null): mixed
    {
        $values = self::load();
        if (array_key_exists($key, $values)) {
            return $values[$key];
        }
        $definition = SettingsRegistry::get($key);

        return $definition['default'] ?? $default;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        return filter_var(self::get($key, $default), FILTER_VALIDATE_BOOL);
    }

    public static function int(string $key, int $default = 0): int
    {
        return (int) self::get($key, $default);
    }

    public static function decimal(string $key, string $default = '0'): string
    {
        return (string) self::get($key, $default);
    }

    /** Value for the current (or given) locale from `<key>_ar` / `<key>_en` pairs. */
    public static function localized(string $baseKey, ?string $locale = null, mixed $default = null): mixed
    {
        $locale ??= app()->getLocale();
        $value = self::get($baseKey.'_'.$locale);
        if ($value === null || $value === '') {
            $value = self::get($baseKey.'_'.config('app.fallback_locale'));
        }

        return $value ?? $default;
    }

    public static function set(string $key, mixed $value, ?User $actor = null, ?string $reason = null): void
    {
        $definition = SettingsRegistry::get($key);
        $old = self::get($key);
        $row = SystemSetting::query()->updateOrCreate(['key' => $key], [
            'group' => $definition['group'] ?? explode('.', $key)[0],
            'value' => $value,
            'type' => $definition['type'] ?? 'string',
            'is_public' => (bool) ($definition['public'] ?? false),
            'is_sensitive' => (bool) ($definition['sensitive'] ?? false),
            'updated_by' => $actor?->id,
        ]);
        self::flush();

        if ($old !== $value) {
            $sensitive = (bool) ($definition['sensitive'] ?? false);
            app(AuditService::class)->log('settings.updated', $row, old: [$key => $sensitive ? '***' : $old], new: [$key => $sensitive ? '***' : $value], reason: $reason, actor: $actor);
        }
    }

    /** @param  array<string, mixed>  $values */
    public static function setMany(array $values, ?User $actor = null, ?string $reason = null): void
    {
        foreach ($values as $key => $value) {
            self::set($key, $value, $actor, $reason);
        }
    }

    /** All public settings (safe for the browser), with defaults filled in. */
    public static function public(): array
    {
        $out = [];
        foreach (SettingsRegistry::all() as $key => $definition) {
            if ($definition['public']) {
                $out[$key] = self::get($key);
            }
        }

        return $out;
    }

    /** All settings for the admin UI (sensitive values masked). */
    public static function allForAdmin(): array
    {
        $out = [];
        foreach (SettingsRegistry::all() as $key => $definition) {
            $value = self::get($key);
            $out[$key] = [
                'value' => $definition['sensitive'] && $value ? '••••••••' : $value,
                'definition' => $definition,
            ];
        }

        return $out;
    }

    public static function flush(): void
    {
        self::$loaded = null;
        Cache::forget(self::CACHE_KEY);
    }

    /** @return array<string, mixed> */
    private static function load(): array
    {
        if (self::$loaded !== null) {
            return self::$loaded;
        }

        return self::$loaded = Cache::rememberForever(self::CACHE_KEY, function () {
            try {
                return SystemSetting::query()->pluck('value', 'key')->all();
            } catch (\Throwable) {
                return []; // table not migrated yet (install time)
            }
        });
    }
}
