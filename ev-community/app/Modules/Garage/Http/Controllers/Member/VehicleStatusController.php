<?php

namespace App\Modules\Garage\Http\Controllers\Member;

use App\Http\Controllers\Controller;
use App\Modules\Garage\Http\Requests\ChangeStatusRequest;
use App\Modules\Vehicles\Actions\ChangeVehicleStatus;
use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use App\Modules\Vehicles\Models\MemberVehicle;
use Illuminate\Http\RedirectResponse;

class VehicleStatusController extends Controller
{
    public function __invoke(ChangeStatusRequest $request, MemberVehicle $vehicle, ChangeVehicleStatus $change): RedirectResponse
    {
        $status = VehicleStatus::from($request->validated('status'));
        $change->execute($vehicle, $status, $request->user(), $request->validated('reason'));

        return back()->with('success', __('garage.flash.status_changed', ['status' => $status->label()]));
    }
}
