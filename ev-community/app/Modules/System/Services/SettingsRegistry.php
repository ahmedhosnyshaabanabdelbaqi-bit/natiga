<?php

namespace App\Modules\System\Services;

use Illuminate\Support\Facades\File;

/**
 * Aggregates setting definitions from app/Modules/<Module>/Settings.php.
 *
 * Definition shape:
 *   'orders.deposit_percentage' => ['group' => 'orders', 'type' => 'decimal', 'default' => 30, 'public' => false,
 *       'label' => ['ar' => 'نسبة العربون', 'en' => 'Deposit percentage'], 'rules' => 'numeric|min:0|max:100']
 */
final class SettingsRegistry
{
    /** @var array<string, array<string, mixed>>|null */
    private static ?array $definitions = null;

    /** @var array<string, array<string, mixed>> definitions registered at runtime (e.g. by a ServiceProvider) */
    private static array $registered = [];

    /**
     * Register a definition from code (same shape as a Settings.php entry). Used for settings whose
     * definition is computed at boot time, e.g. integration credentials (`'sensitive' => true`).
     *
     * @param  array<string, mixed>  $definition
     */
    public static function register(string $key, array $definition, string $module = 'System'): void
    {
        self::$registered[$key] = $definition + ['module' => $module];
        self::$definitions = null;
    }

    /** @return array<string, array<string, mixed>> */
    public static function all(): array
    {
        if (self::$definitions !== null) {
            return self::$definitions;
        }
        $definitions = [];
        foreach (File::glob(app_path('Modules/*/Settings.php')) as $file) {
            $module = basename(dirname($file));
            $items = require $file;
            foreach ($items as $key => $definition) {
                $definition['module'] = $module;
                $definitions[$key] = self::normalize($key, $definition);
            }
        }
        foreach (self::$registered as $key => $definition) {
            $definitions[$key] = self::normalize($key, $definition);
        }
        ksort($definitions);

        return self::$definitions = $definitions;
    }

    public static function get(string $key): ?array
    {
        return self::all()[$key] ?? null;
    }

    /** @return array<string, array<string, array<string, mixed>>> grouped by group */
    public static function grouped(): array
    {
        $grouped = [];
        foreach (self::all() as $key => $definition) {
            $grouped[$definition['group']][$key] = $definition;
        }

        return $grouped;
    }

    public static function reset(): void
    {
        self::$definitions = null;
        self::$registered = [];
    }

    /**
     * @param  array<string, mixed>  $definition
     * @return array<string, mixed>
     */
    private static function normalize(string $key, array $definition): array
    {
        $definition['group'] ??= explode('.', $key)[0];
        $definition['type'] ??= 'string';
        $definition['public'] ??= false;
        $definition['sensitive'] ??= false;
        if ($definition['sensitive']) {
            $definition['public'] = false; // a secret is never sent to the browser
        }

        return $definition;
    }
}
