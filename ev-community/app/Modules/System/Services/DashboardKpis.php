<?php

namespace App\Modules\System\Services;

use App\Models\User;
use Closure;

/**
 * Modules register real, query-backed KPIs for the admin/partner dashboards in their ServiceProvider:
 *
 *   DashboardKpis::register('active_orders', permission: 'orders.view', resolver: fn () => Order::active()->count(),
 *       label: 'admin.dashboard.active_orders', href: '/admin/orders?status=active', source: 'orders.status in (confirmed, processing, ready)');
 *
 * No KPI is ever hardcoded/fake: each one is computed from the database when the dashboard renders.
 */
final class DashboardKpis
{
    /** @var array<string, array<string, array{label: string, permission: ?string, resolver: Closure, href: ?string, source: ?string, format: string, tone: string, order: int}>> */
    private static array $kpis = ['admin' => [], 'partner' => [], 'member' => []];

    public static function register(string $key, ?string $permission, Closure $resolver, string $label, ?string $href = null, ?string $source = null, string $format = 'number', string $tone = 'default', int $order = 100, string $space = 'admin'): void
    {
        self::$kpis[$space][$key] = compact('label', 'permission', 'resolver', 'href', 'source', 'format', 'tone', 'order');
    }

    /** @return array<int, array{key: string, label: string, value: mixed, href: ?string, source: ?string, format: string, tone: string}> */
    public static function resolveFor(?User $user, string $space = 'admin', mixed $context = null): array
    {
        $out = [];
        $list = self::$kpis[$space] ?? [];
        uasort($list, fn ($a, $b) => $a['order'] <=> $b['order']);
        foreach ($list as $key => $kpi) {
            if ($kpi['permission'] && $user && ! $user->can($kpi['permission'])) {
                continue;
            }
            try {
                $value = ($kpi['resolver'])($context);
            } catch (\Throwable $e) {
                report($e);
                $value = null;
            }
            $out[] = ['key' => $key, 'label' => __($kpi['label']), 'value' => $value, 'href' => $kpi['href'], 'source' => $kpi['source'], 'format' => $kpi['format'], 'tone' => $kpi['tone']];
        }

        return $out;
    }

    public static function reset(): void
    {
        self::$kpis = ['admin' => [], 'partner' => [], 'member' => []];
    }
}
