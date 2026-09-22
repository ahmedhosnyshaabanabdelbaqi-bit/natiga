<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Modules\Access\Services\PermissionService;
use App\Modules\Core\Services\BusinessCalendar;
use App\Modules\Reporting\Services\ReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ReportController extends Controller
{
    public function __construct(
        private readonly ReportService $reports,
        private readonly BusinessCalendar $calendar,
        private readonly PermissionService $permissions,
    ) {}

    public function dashboard(Request $request): JsonResponse
    {
        [$from, $to] = $this->range($request);
        $branchId = $request->attributes->get('pos.branch_id');

        $data = $this->reports->dashboard($from, $to, $branchId);

        // Profit figures are a separate permission from seeing sales.
        if (! $this->permissions->userCan($request->user(), 'reports.profit', $branchId)) {
            unset($data['cost_of_sales'], $data['gross_profit'], $data['operating_profit']);
        }

        return response()->json($data);
    }

    public function sales(Request $request): JsonResponse
    {
        [$from, $to] = $this->range($request);

        return response()->json([
            'period' => ['from' => $from, 'to' => $to, 'timezone' => $this->calendar->timezone()],
            'rows' => $this->reports->salesByPeriod($from, $to, $request->query('group_by', 'day'), $request->attributes->get('pos.branch_id')),
            'payment_mix' => $this->reports->paymentMix($from, $to, $request->attributes->get('pos.branch_id')),
        ]);
    }

    public function products(Request $request): JsonResponse
    {
        [$from, $to] = $this->range($request);

        $rows = $this->reports->topProducts(
            $from, $to,
            (int) $request->query('limit', 20),
            $request->query('direction', 'desc'),
            $request->attributes->get('pos.branch_id'),
        );

        if (! $this->permissions->userCan($request->user(), 'reports.profit', $request->attributes->get('pos.branch_id'))) {
            $rows = array_map(function (array $r): array {
                unset($r['cost'], $r['profit']);

                return $r;
            }, $rows);
        }

        return response()->json(['period' => ['from' => $from, 'to' => $to], 'rows' => $rows]);
    }

    public function inventory(Request $request): JsonResponse
    {
        return response()->json($this->reports->inventoryValuation(
            $request->query('warehouse_id') ? (int) $request->query('warehouse_id') : null
        ));
    }

    public function alerts(Request $request): JsonResponse
    {
        return response()->json($this->reports->alerts($request->attributes->get('pos.branch_id')));
    }

    /** Every reported number can be opened to the documents behind it. */
    public function drillDown(Request $request): JsonResponse
    {
        $data = $request->validate([
            'metric' => ['required', 'string', 'max:40'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        [$from, $to] = $this->range($request);

        return response()->json($this->reports->drillDown(
            $data['metric'], $from, $to,
            $request->attributes->get('pos.branch_id'),
            (int) ($data['page'] ?? 1),
        ));
    }

    /** @return array{0:string,1:string} Business-day range, shared by all reports. */
    private function range(Request $request): array
    {
        $from = $request->query('from') ?: $this->calendar->businessDate();
        $to = $request->query('to') ?: $from;

        return [$from, $to];
    }
}
