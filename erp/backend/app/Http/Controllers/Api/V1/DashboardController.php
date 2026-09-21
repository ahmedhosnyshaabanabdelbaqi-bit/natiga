<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Reporting\DashboardService;
use App\Domain\Reporting\KpiDictionary;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends ApiController
{
    public function __construct(private readonly DashboardService $dashboard) {}

    public function index(Request $request): JsonResponse
    {
        $from = $request->input('from', now()->startOfMonth()->toDateString());
        $to = $request->input('to', now()->toDateString());

        return $this->ok($this->dashboard->forUser($request->user(), $from, $to));
    }

    public function dictionary(): JsonResponse
    {
        return $this->ok(KpiDictionary::all());
    }
}
