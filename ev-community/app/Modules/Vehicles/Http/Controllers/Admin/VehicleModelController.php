<?php

namespace App\Modules\Vehicles\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Vehicles\Http\Requests\ModelRequest;
use App\Modules\Vehicles\Models\VehicleMake;
use App\Modules\Vehicles\Models\VehicleModel;
use App\Modules\Vehicles\Services\VehicleMasterService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class VehicleModelController extends Controller
{
    public function __construct(private readonly VehicleMasterService $master) {}

    public function index(Request $request): Response
    {
        $makeId = $request->integer('make') ?: null;
        $models = VehicleModel::query()->with('make')->withCount(['variants', 'memberVehicles'])
            ->when($makeId, fn ($q) => $q->where('vehicle_make_id', $makeId))
            ->orderBy('vehicle_make_id')->ordered()->get()
            ->map(fn (VehicleModel $model) => [
                'id' => $model->id,
                'vehicle_make_id' => $model->vehicle_make_id,
                'make_name' => $model->make->name(),
                'slug' => $model->slug,
                'name_ar' => $model->name_ar,
                'name_en' => $model->name_en,
                'name' => $model->name(),
                'model_code' => $model->model_code,
                'body_type' => $model->body_type,
                'is_active' => $model->is_active,
                'sort_order' => $model->sort_order,
                'variants_count' => $model->variants_count,
                'vehicles_count' => $model->member_vehicles_count,
            ])->values()->all();

        return Inertia::render('admin/vehicles/models', [
            'makes' => $this->makes(),
            'models' => $models,
            'bodyTypes' => VehicleModel::BODY_TYPES,
            'filters' => ['make' => $makeId],
            'canManage' => $request->user()->can('vehicles.manage_master'),
        ]);
    }

    public function store(ModelRequest $request): RedirectResponse
    {
        $this->master->saveModel($request->validated(), null, $request->user());

        return back()->with('success', __('vehicles.flash.model_saved'));
    }

    public function update(ModelRequest $request, VehicleModel $model): RedirectResponse
    {
        $this->master->saveModel($request->validated(), $model, $request->user());

        return back()->with('success', __('vehicles.flash.model_saved'));
    }

    public function toggle(Request $request, VehicleModel $model): RedirectResponse
    {
        $model = $this->master->toggleModel($model, $request->user());

        return back()->with('success', __($model->is_active ? 'vehicles.flash.activated' : 'vehicles.flash.deactivated'));
    }

    public function destroy(Request $request, VehicleModel $model): RedirectResponse
    {
        $this->master->deleteModel($model, $request->user());

        return back()->with('success', __('vehicles.flash.deleted'));
    }

    private function makes(): array
    {
        return VehicleMake::query()->ordered()->get()->map(fn (VehicleMake $m) => ['id' => $m->id, 'name' => $m->name(), 'is_active' => $m->is_active])->values()->all();
    }
}
