<?php

namespace App\Modules\Rbac\Services;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

/**
 * Aggregates app/Modules/<Module>/Permissions.php files into one registry.
 */
final class PermissionRegistry
{
    public const ROLES = [
        'owner' => ['ar' => 'المالك', 'en' => 'Owner', 'super' => true, 'portal' => 'admin'],
        'super-admin' => ['ar' => 'مدير عام', 'en' => 'Super Admin', 'super' => true, 'portal' => 'admin'],
        'operations-manager' => ['ar' => 'مدير العمليات', 'en' => 'Operations Manager', 'portal' => 'admin'],
        'accountant' => ['ar' => 'محاسب', 'en' => 'Accountant', 'portal' => 'admin'],
        'procurement-officer' => ['ar' => 'مسؤول المشتريات', 'en' => 'Procurement Officer', 'portal' => 'admin'],
        'shipping-officer' => ['ar' => 'مسؤول الشحن', 'en' => 'Shipping Officer', 'portal' => 'admin'],
        'warehouse-officer' => ['ar' => 'مسؤول المخازن', 'en' => 'Warehouse Officer', 'portal' => 'admin'],
        'delivery-officer' => ['ar' => 'مسؤول التسليم', 'en' => 'Delivery Officer', 'portal' => 'admin'],
        'maintenance-manager' => ['ar' => 'مدير الصيانة', 'en' => 'Maintenance Manager', 'portal' => 'admin'],
        'charging-content-manager' => ['ar' => 'مدير محتوى الشحن', 'en' => 'Charging Content Manager', 'portal' => 'admin'],
        'content-manager' => ['ar' => 'مدير المحتوى', 'en' => 'Content Manager', 'portal' => 'admin'],
        'support-agent' => ['ar' => 'موظف الدعم', 'en' => 'Support Agent', 'portal' => 'admin'],
        'service-center-admin' => ['ar' => 'مدير مركز صيانة', 'en' => 'Service Center Admin', 'portal' => 'partner'],
        'service-center-employee' => ['ar' => 'موظف مركز صيانة', 'en' => 'Service Center Employee', 'portal' => 'partner'],
        'member' => ['ar' => 'عضو', 'en' => 'Member', 'portal' => 'member'],
    ];

    public const SUPER_ROLES = ['owner', 'super-admin'];

    /** @var array<string, array{label: array{ar: string, en: string}, roles: string[], module: string}>|null */
    private static ?array $permissions = null;

    /** @return array<string, array{label: array{ar: string, en: string}, roles: string[], module: string}> */
    public static function permissions(): array
    {
        if (self::$permissions !== null) {
            return self::$permissions;
        }
        $all = [];
        foreach (File::glob(app_path('Modules/*/Permissions.php')) as $file) {
            $module = basename(dirname($file));
            foreach (require $file as $key => $definition) {
                $definition['module'] = $module;
                $definition['roles'] = array_values(array_unique($definition['roles'] ?? []));
                $all[$key] = $definition;
            }
        }
        ksort($all);

        return self::$permissions = $all;
    }

    /** @return array<string, string[]> role => permission keys (default grants) */
    public static function defaultRoleGrants(): array
    {
        $grants = array_fill_keys(array_keys(self::ROLES), []);
        foreach (self::permissions() as $key => $definition) {
            foreach ($definition['roles'] as $role) {
                if (! isset($grants[$role])) {
                    throw new \RuntimeException("Permission [{$key}] references unknown role [{$role}]");
                }
                $grants[$role][] = $key;
            }
        }
        foreach (self::SUPER_ROLES as $role) {
            $grants[$role] = array_keys(self::permissions());
        }

        return $grants;
    }

    public static function isSuperRole(string $role): bool
    {
        return in_array($role, self::SUPER_ROLES, true);
    }

    /** @return array<string, array<string, array{label: array{ar: string, en: string}}>> grouped by module */
    public static function grouped(): array
    {
        $grouped = [];
        foreach (self::permissions() as $key => $definition) {
            $grouped[$definition['module']][$key] = $definition;
        }

        return $grouped;
    }

    /**
     * Bilingual label of a permission group (module directory name, e.g. `ServiceCenters`) taken from the
     * module registry in config/ev.php; falls back to the directory name.
     *
     * @return array{ar: string, en: string}
     */
    public static function moduleLabel(string $module): array
    {
        $name = config('ev.modules.'.Str::snake($module).'.name');
        if (is_array($name) && isset($name['ar'], $name['en'])) {
            return ['ar' => (string) $name['ar'], 'en' => (string) $name['en']];
        }
        $fallback = Str::headline($module);

        return ['ar' => $fallback, 'en' => $fallback];
    }

    public static function reset(): void
    {
        self::$permissions = null;
    }
}
