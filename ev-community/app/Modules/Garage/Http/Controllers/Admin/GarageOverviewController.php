<?php

namespace App\Modules\Garage\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Garage\Services\GarageStats;
use Inertia\Inertia;
use Inertia\Response;

/** GET /admin/garage — "My Garage data" overview (live aggregations). */
class GarageOverviewController extends Controller
{
    public function __invoke(GarageStats $stats): Response
    {
        return Inertia::render('admin/garage/index', [
            'stats' => $stats->overview(),
            'memberVehiclesUrl' => route('admin.vehicles.members.index', absolute: false),
        ]);
    }
}
