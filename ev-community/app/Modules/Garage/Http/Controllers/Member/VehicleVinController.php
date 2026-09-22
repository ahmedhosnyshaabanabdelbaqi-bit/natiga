<?php

namespace App\Modules\Garage\Http\Controllers\Member;

use App\Http\Controllers\Controller;
use App\Modules\Vehicles\Actions\RevealVin;
use App\Modules\Vehicles\Models\MemberVehicle;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** POST /account/garage/{vehicle}/vin/reveal — returns the decrypted VIN to its owner (audited). */
class VehicleVinController extends Controller
{
    use AuthorizesRequests;

    public function __invoke(Request $request, MemberVehicle $vehicle, RevealVin $reveal): JsonResponse
    {
        $this->authorize('revealVin', $vehicle);

        return response()->json(['data' => ['vin' => $reveal->execute($vehicle, $request->user())]])
            ->header('Cache-Control', 'no-store');
    }
}
