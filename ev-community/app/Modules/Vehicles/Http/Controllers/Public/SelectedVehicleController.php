<?php

namespace App\Modules\Vehicles\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Modules\Vehicles\Http\Requests\SelectVehicleRequest;
use App\Modules\Vehicles\Services\SelectedVehicle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * Session-backed "selected vehicle" for guests (members get their primary garage vehicle automatically).
 * Works both as an Inertia form target (redirect back) and as a JSON endpoint (fetch).
 */
class SelectedVehicleController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => SelectedVehicle::current($request)]);
    }

    public function store(SelectVehicleRequest $request): JsonResponse|RedirectResponse
    {
        SelectedVehicle::store($request, $request->validated());
        $current = SelectedVehicle::current($request);

        return $request->inertia() || ! $request->expectsJson()
            ? back()->with('status', __('vehicles.public.selected').': '.($current['display_name'] ?? ''))
            : response()->json(['data' => $current]);
    }

    public function destroy(Request $request): JsonResponse|RedirectResponse
    {
        SelectedVehicle::clear($request);

        return $request->inertia() || ! $request->expectsJson() ? back() : response()->json(['data' => SelectedVehicle::current($request)]);
    }
}
