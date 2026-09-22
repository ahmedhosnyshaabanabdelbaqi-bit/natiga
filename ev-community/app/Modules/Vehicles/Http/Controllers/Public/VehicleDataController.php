<?php

namespace App\Modules\Vehicles\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Modules\Vehicles\Services\VehicleDataService;
use Illuminate\Http\JsonResponse;

/** GET /{locale}/vehicles/data — active makes/models/variants (localized), cached 1h server-side. */
class VehicleDataController extends Controller
{
    public function __invoke(VehicleDataService $data): JsonResponse
    {
        return response()->json($data->forLocale(app()->getLocale()))
            ->header('Cache-Control', 'public, max-age=300');
    }
}
