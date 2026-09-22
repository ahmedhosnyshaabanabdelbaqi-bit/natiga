<?php

namespace App\Modules\Vehicles\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Vehicles\Http\Requests\VariantRequest;
use App\Modules\Vehicles\Models\BatteryVariant;
use App\Modules\Vehicles\Models\ConnectorType;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\VehicleMake;
use App\Modules\Vehicles\Models\VehicleModel;
use App\Modules\Vehicles\Models\VehicleVariant;
use App\Modules\Vehicles\Services\VehicleMasterService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class VehicleVariantController extends Controller
{
    public function __construct(private readonly VehicleMasterService $master) {}

    public function index(Request $request): Response
    {
        $makeId = $request->integer('make') ?: null;
        $modelId = $request->integer('model') ?: null;
        if ($modelId && ! $makeId) {
            $makeId = VehicleModel::query()->whereKey($modelId)->value('vehicle_make_id');
        }

        $variants = VehicleVariant::query()->with(['model.make', 'battery', 'acConnector', 'dcConnector'])->withCount('memberVehicles')
            ->when($modelId, fn ($q) => $q->where('vehicle_model_id', $modelId))
            ->when(! $modelId && $makeId, fn ($q) => $q->whereHas('model', fn ($m) => $m->where('vehicle_make_id', $makeId)))
            ->orderBy('vehicle_model_id')->orderBy('sort_order')->orderByDesc('year_from')->limit(300)->get()
            ->map(fn (VehicleVariant $v) => [
                'id' => $v->id,
                'vehicle_model_id' => $v->vehicle_model_id,
                'make_name' => $v->model->make->name(),
                'model_name' => $v->model->name(),
                'name_ar' => $v->name_ar,
                'name_en' => $v->name_en,
                'name' => $v->name(),
                'trim' => $v->trim,
                'market_version' => $v->market_version->value,
                'market_version_label' => $v->market_version->label(),
                'year_from' => $v->year_from,
                'year_to' => $v->year_to,
                'battery_variant_id' => $v->battery_variant_id,
                'battery_name' => $v->battery?->name,
                'ac_connector_type_id' => $v->ac_connector_type_id,
                'dc_connector_type_id' => $v->dc_connector_type_id,
                'ac_connector' => $v->acConnector?->name(),
                'dc_connector' => $v->dcConnector?->name(),
                'battery_capacity_kwh' => $v->battery_capacity_kwh !== null ? (string) $v->battery_capacity_kwh : null,
                'motor_kw' => $v->motor_kw,
                'range_km_wltp' => $v->range_km_wltp,
                'notes' => $v->notes,
                'is_active' => $v->is_active,
                'sort_order' => $v->sort_order,
                'vehicles_count' => $v->member_vehicles_count,
            ])->values()->all();

        return Inertia::render('admin/vehicles/variants', [
            'makes' => VehicleMake::query()->ordered()->get()->map(fn (VehicleMake $m) => ['id' => $m->id, 'name' => $m->name()])->values()->all(),
            'models' => VehicleModel::query()->when($makeId, fn ($q) => $q->where('vehicle_make_id', $makeId))->ordered()->get()
                ->map(fn (VehicleModel $m) => ['id' => $m->id, 'vehicle_make_id' => $m->vehicle_make_id, 'name' => $m->name()])->values()->all(),
            'variants' => $variants,
            'batteries' => BatteryVariant::query()->orderBy('capacity_kwh')->get()
                ->map(fn (BatteryVariant $b) => ['id' => $b->id, 'name' => $b->name, 'capacity_kwh' => (string) $b->capacity_kwh, 'chemistry' => $b->chemistry, 'notes' => $b->notes])->values()->all(),
            'connectors' => ConnectorType::query()->ordered()->get()
                ->map(fn (ConnectorType $c) => ['id' => $c->id, 'code' => $c->code, 'name' => $c->name(), 'current_type' => $c->current_type->value, 'is_active' => $c->is_active])->values()->all(),
            'marketVersions' => MarketVersion::options(),
            'chemistries' => BatteryVariant::CHEMISTRIES,
            'filters' => ['make' => $makeId, 'model' => $modelId],
            'canManage' => $request->user()->can('vehicles.manage_master'),
        ]);
    }

    public function store(VariantRequest $request): RedirectResponse
    {
        $this->master->saveVariant($request->validated(), null, $request->user());

        return back()->with('success', __('vehicles.flash.variant_saved'));
    }

    public function update(VariantRequest $request, VehicleVariant $variant): RedirectResponse
    {
        $this->master->saveVariant($request->validated(), $variant, $request->user());

        return back()->with('success', __('vehicles.flash.variant_saved'));
    }

    public function toggle(Request $request, VehicleVariant $variant): RedirectResponse
    {
        $variant = $this->master->toggleVariant($variant, $request->user());

        return back()->with('success', __($variant->is_active ? 'vehicles.flash.activated' : 'vehicles.flash.deactivated'));
    }

    public function destroy(Request $request, VehicleVariant $variant): RedirectResponse
    {
        $this->master->deleteVariant($variant, $request->user());

        return back()->with('success', __('vehicles.flash.deleted'));
    }
}
