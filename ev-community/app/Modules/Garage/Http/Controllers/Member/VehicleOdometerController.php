<?php

namespace App\Modules\Garage\Http\Controllers\Member;

use App\Http\Controllers\Controller;
use App\Modules\Garage\Http\Requests\UpdateOdometerRequest;
use App\Modules\Vehicles\Actions\UpdateOdometer;
use App\Modules\Vehicles\Models\MemberVehicle;
use Illuminate\Http\RedirectResponse;

class VehicleOdometerController extends Controller
{
    public function __invoke(UpdateOdometerRequest $request, MemberVehicle $vehicle, UpdateOdometer $update): RedirectResponse
    {
        $update->execute($vehicle, $request->user(), (int) $request->validated('odometer_km'), $request->validated('reason'));

        return back()->with('success', __('garage.flash.odometer_updated'));
    }
}
