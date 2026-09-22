<?php

namespace App\Modules\Garage\Http\Controllers\Member;

use App\Http\Controllers\Controller;
use App\Modules\Vehicles\Actions\SetPrimaryVehicle;
use App\Modules\Vehicles\Models\MemberVehicle;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class VehiclePrimaryController extends Controller
{
    use AuthorizesRequests;

    public function __invoke(Request $request, MemberVehicle $vehicle, SetPrimaryVehicle $setPrimary): RedirectResponse
    {
        $this->authorize('update', $vehicle);
        $setPrimary->execute($vehicle, $request->user());

        return back()->with('success', __('garage.flash.primary_set'));
    }
}
