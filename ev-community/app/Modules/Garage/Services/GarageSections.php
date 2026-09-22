<?php

namespace App\Modules\Garage\Services;

use App\Models\User;
use App\Modules\System\Services\Modules;
use App\Modules\Vehicles\Models\MemberVehicle;
use Closure;

/**
 * Registry of the tabs shown on the member's vehicle page (/account/garage/{vehicle}).
 *
 * Modules register a section in their ServiceProvider `boot()`:
 *
 *   GarageSections::register(
 *       key: 'orders',                                  // also the frontend component: resources/js/features/garage/sections/orders.tsx
 *       labelKey: 'orders.garage.section_title',        // translation key for the tab label
 *       resolver: fn (MemberVehicle $vehicle, User $user): ?array => [...],   // data passed to the component (null = hide the tab)
 *       module: 'orders',                               // section is only shown when this module is enabled
 *       order: 40,
 *       permission: null,                               // optional permission the viewing user must hold
 *   );
 *
 * The resolver runs lazily (Inertia deferred prop) after first paint, so heavy queries never block the page.
 * Sections without a frontend component fall back to `SectionPlaceholder` (shared EmptyState).
 */
final class GarageSections
{
    /** @var array<string, array{key: string, label_key: string, resolver: Closure, module: ?string, order: int, permission: ?string}> */
    private static array $sections = [];

    /** @param  Closure(MemberVehicle, User): ?array  $resolver */
    public static function register(string $key, string $labelKey, Closure $resolver, ?string $module = null, int $order = 100, ?string $permission = null): void
    {
        if (! preg_match('/^[a-z][a-z0-9_]*$/', $key)) {
            throw new \InvalidArgumentException("Garage section key [{$key}] must be snake_case.");
        }
        self::$sections[$key] = ['key' => $key, 'label_key' => $labelKey, 'resolver' => $resolver, 'module' => $module, 'order' => $order, 'permission' => $permission];
    }

    public static function forget(string $key): void
    {
        unset(self::$sections[$key]);
    }

    /**
     * Sections visible to the given user (module enabled + permission), sorted by order.
     *
     * @return array<int, array{key: string, label_key: string, resolver: Closure, module: ?string, order: int, permission: ?string}>
     */
    public static function enabledFor(?User $user = null): array
    {
        $list = array_filter(self::$sections, function (array $section) use ($user) {
            if ($section['module'] !== null && ! Modules::enabled($section['module'])) {
                return false;
            }
            if ($section['permission'] !== null && (! $user || ! $user->can($section['permission']))) {
                return false;
            }

            return true;
        });
        uasort($list, fn ($a, $b) => $a['order'] <=> $b['order'] ?: strcmp($a['key'], $b['key']));

        return array_values($list);
    }

    /**
     * Metadata for the tab list (no data resolved).
     *
     * @return array<int, array{key: string, label: string, module: ?string, order: int}>
     */
    public static function tabsFor(?User $user = null): array
    {
        return array_map(fn (array $s) => ['key' => $s['key'], 'label' => __($s['label_key']), 'module' => $s['module'], 'order' => $s['order']], self::enabledFor($user));
    }

    /** Resolve one section's data (null hides the tab). Exceptions are reported, never break the page. */
    public static function resolve(string $key, MemberVehicle $vehicle, User $user): ?array
    {
        $section = self::$sections[$key] ?? null;
        if ($section === null) {
            return null;
        }
        try {
            return ($section['resolver'])($vehicle, $user);
        } catch (\Throwable $e) {
            report($e);

            return ['error' => __('core.states.error')];
        }
    }

    public static function has(string $key): bool
    {
        return isset(self::$sections[$key]);
    }

    /** @return string[] */
    public static function keys(): array
    {
        return array_keys(self::$sections);
    }

    public static function reset(): void
    {
        self::$sections = [];
    }
}
