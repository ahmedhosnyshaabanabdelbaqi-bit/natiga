<?php

namespace App\Modules\Vehicles\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Vehicles\Http\Requests\MakeRequest;
use App\Modules\Vehicles\Models\VehicleMake;
use App\Modules\Vehicles\Services\VehicleMasterService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class VehicleMakeController extends Controller
{
    public function __construct(private readonly VehicleMasterService $master) {}

    public function index(Request $request): Response
    {
        $makes = VehicleMake::query()->ordered()->withCount(['models', 'memberVehicles'])->get()
            ->map(fn (VehicleMake $make) => [
                'id' => $make->id,
                'slug' => $make->slug,
                'name_ar' => $make->name_ar,
                'name_en' => $make->name_en,
                'name' => $make->name(),
                'logo' => $make->logoUrl(),
                'country_code' => $make->country_code,
                'is_active' => $make->is_active,
                'sort_order' => $make->sort_order,
                'models_count' => $make->models_count,
                'vehicles_count' => $make->member_vehicles_count,
            ])->values()->all();

        return Inertia::render('admin/vehicles/makes', [
            'makes' => $makes,
            'canManage' => $request->user()->can('vehicles.manage_master'),
        ]);
    }

    public function store(MakeRequest $request): RedirectResponse
    {
        $this->master->saveMake($request->validated(), null, $request->file('logo'), $request->user());

        return back()->with('success', __('vehicles.flash.make_saved'));
    }

    public function update(MakeRequest $request, VehicleMake $make): RedirectResponse
    {
        $this->master->saveMake($request->validated(), $make, $request->file('logo'), $request->user(), $request->boolean('remove_logo'));

        return back()->with('success', __('vehicles.flash.make_saved'));
    }

    public function toggle(Request $request, VehicleMake $make): RedirectResponse
    {
        $make = $this->master->toggleMake($make, $request->user());

        return back()->with('success', __($make->is_active ? 'vehicles.flash.activated' : 'vehicles.flash.deactivated'));
    }

    public function destroy(Request $request, VehicleMake $make): RedirectResponse
    {
        $this->master->deleteMake($make, $request->user());

        return back()->with('success', __('vehicles.flash.deleted'));
    }
}
