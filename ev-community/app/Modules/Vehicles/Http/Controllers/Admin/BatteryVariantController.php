<?php

namespace App\Modules\Vehicles\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Vehicles\Http\Requests\BatteryRequest;
use App\Modules\Vehicles\Models\BatteryVariant;
use App\Modules\Vehicles\Services\VehicleMasterService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class BatteryVariantController extends Controller
{
    public function __construct(private readonly VehicleMasterService $master) {}

    public function store(BatteryRequest $request): RedirectResponse
    {
        $this->master->saveBattery($request->validated(), null, $request->user());

        return back()->with('success', __('vehicles.flash.battery_saved'));
    }

    public function update(BatteryRequest $request, BatteryVariant $battery): RedirectResponse
    {
        $this->master->saveBattery($request->validated(), $battery, $request->user());

        return back()->with('success', __('vehicles.flash.battery_saved'));
    }

    public function destroy(Request $request, BatteryVariant $battery): RedirectResponse
    {
        $this->master->deleteBattery($battery, $request->user());

        return back()->with('success', __('vehicles.flash.deleted'));
    }
}
