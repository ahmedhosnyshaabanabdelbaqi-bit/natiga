<?php

namespace App\Modules\System\Http\Controllers\Partner;

use App\Http\Controllers\Controller;
use App\Modules\System\Services\DashboardKpis;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $center = method_exists($request->user(), 'currentCenter') ? $request->user()->currentCenter() : null;

        return Inertia::render('partner/dashboard', [
            'kpis' => DashboardKpis::resolveFor($request->user(), 'partner', $center),
            'center' => $center ? ['id' => $center->public_id, 'name' => $center->tr('name')] : null,
        ]);
    }
}
