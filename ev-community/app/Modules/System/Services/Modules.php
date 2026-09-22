<?php

namespace App\Modules\System\Services;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\System\Models\ModuleSetting;
use Illuminate\Support\Facades\Cache;

/**
 * Module on/off registry. Disabling a module hides its UI and blocks its routes (`module:` middleware)
 * but never deletes data.
 */
final class Modules
{
    private const CACHE_KEY = 'ev.modules.v1';

    /** @var array<string, bool>|null */
    private static ?array $states = null;

    /** @return array<string, array{name: array{ar: string, en: string}, core: bool, experimental: bool, enabled: bool}> */
    public static function all(): array
    {
        $states = self::states();
        $out = [];
        foreach (config('ev.modules', []) as $key => $definition) {
            $out[$key] = [
                'key' => $key,
                'name' => $definition['name'],
                'core' => (bool) ($definition['core'] ?? false),
                'experimental' => (bool) ($definition['experimental'] ?? false),
                'enabled' => self::enabled($key),
            ];
        }

        return $out;
    }

    public static function enabled(string $key): bool
    {
        $definition = config('ev.modules.'.$key);
        if ($definition === null) {
            return false;
        }
        if ($definition['core'] ?? false) {
            return true;
        }
        $states = self::states();

        return $states[$key] ?? (bool) ($definition['default_enabled'] ?? true);
    }

    /** @return array<string, bool> */
    public static function enabledMap(): array
    {
        $map = [];
        foreach (array_keys(config('ev.modules', [])) as $key) {
            $map[$key] = self::enabled($key);
        }

        return $map;
    }

    public static function setEnabled(string $key, bool $enabled, ?User $actor = null, ?string $reason = null): void
    {
        $definition = config('ev.modules.'.$key) ?? throw new \InvalidArgumentException("Unknown module [{$key}]");
        if (($definition['core'] ?? false) && ! $enabled) {
            throw new \InvalidArgumentException("Core module [{$key}] cannot be disabled");
        }
        $old = self::enabled($key);
        $row = ModuleSetting::query()->updateOrCreate(['key' => $key], ['enabled' => $enabled, 'updated_by' => $actor?->id]);
        self::flush();
        if ($old !== $enabled) {
            app(AuditService::class)->log('modules.'.($enabled ? 'enabled' : 'disabled'), $row, old: ['enabled' => $old], new: ['enabled' => $enabled], reason: $reason, actor: $actor);
        }
    }

    public static function flush(): void
    {
        self::$states = null;
        Cache::forget(self::CACHE_KEY);
    }

    /** @return array<string, bool> */
    private static function states(): array
    {
        if (self::$states !== null) {
            return self::$states;
        }

        return self::$states = Cache::rememberForever(self::CACHE_KEY, function () {
            try {
                return ModuleSetting::query()->pluck('enabled', 'key')->map(fn ($v) => (bool) $v)->all();
            } catch (\Throwable) {
                return [];
            }
        });
    }
}
