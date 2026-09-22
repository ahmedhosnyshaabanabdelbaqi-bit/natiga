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
                $definition['group'] ??= explode('.', $key)[0];
                $definition['type'] ??= 'string';
                $definition['public'] ??= false;
                $definition['sensitive'] ??= false;
                $definitions[$key] = $definition;
            }
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
    }
}
