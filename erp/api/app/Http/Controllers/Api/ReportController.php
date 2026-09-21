<?php

namespace App\Http\Controllers\Api;

use App\Domain\Credit\CreditService;
use App\Domain\Reporting\DashboardService;
use App\Domain\Reporting\ReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReportController extends BaseApiController
{
    public function __construct(
        private readonly DashboardService $dashboard,
        private readonly ReportService $reports,
        private readonly CreditService $credit,
    ) {}

    public function dashboard(Request $request): JsonResponse
    {
        $payload = $this->dashboard->forUser(
            $request->user(),
            $request->input('from'),
            $request->input('to')
        );

        // Cards the user may not see are removed from the response, not merely
        // flagged, so a hidden KPI never travels over the wire.
        $payload['cards'] = collect($payload['cards'])
            ->filter(fn ($c) => $c['visible'])
            ->map(fn ($c) => collect($c)->except('visible')->all())
            ->values();

        return response()->json($payload);
    }

    public function sales(Request $request): JsonResponse
    {
        $data = $request->validate([
            'dimension' => ['required', 'in:customer,rep,item,brand,category,region,branch,day'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'customer_id' => ['nullable', 'integer'],
            'rep_id' => ['nullable', 'integer'],
            'branch_id' => ['nullable', 'integer'],
            'region_id' => ['nullable', 'integer'],
        ]);

        $result = $this->reports->salesBy($data['dimension'], $data);

        // Margin figures are stripped for users without the profit permission.
        if (! $request->user()->hasPermission('reports.profit.view')) {
            $result['rows'] = $result['rows']->map(fn ($r) => tap($r, function ($row) {
                unset($row->cogs, $row->gross_profit, $row->margin_pct);
            }));
            unset($result['totals']['cogs'], $result['totals']['gross_profit']);
        }

        return response()->json($result);
    }

    public function aging(Request $request): JsonResponse
    {
        return response()->json([
            'as_of' => $request->input('as_of', now()->toDateString()),
            'rows' => $this->credit->agingBuckets(
                $request->integer('customer_id') ?: null,
                $request->input('as_of')
            ),
        ]);
    }

    public function trialBalance(Request $request): JsonResponse
    {
        return response()->json($this->reports->trialBalance(
            $request->input('from', now()->startOfYear()->toDateString()),
            $request->input('to', now()->toDateString())
        ));
    }

    public function incomeStatement(Request $request): JsonResponse
    {
        return response()->json($this->reports->incomeStatement(
            $request->input('from', now()->startOfYear()->toDateString()),
            $request->input('to', now()->toDateString())
        ));
    }

    public function repPerformance(Request $request): JsonResponse
    {
        return response()->json($this->reports->repPerformance(
            $request->input('from', now()->startOfMonth()->toDateString()),
            $request->input('to', now()->toDateString()),
            $request->integer('rep_id') ?: null
        ));
    }

    public function stockSpeed(Request $request): JsonResponse
    {
        return response()->json($this->reports->stockMovementSpeed(
            $request->integer('days') ?: 90
        ));
    }
}
