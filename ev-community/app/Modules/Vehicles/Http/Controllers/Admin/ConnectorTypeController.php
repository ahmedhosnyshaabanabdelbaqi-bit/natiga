<?php

namespace App\Modules\Vehicles\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Vehicles\Http\Requests\ConnectorTypeRequest;
use App\Modules\Vehicles\Models\ConnectorCompatibilityRule;
use App\Modules\Vehicles\Models\ConnectorType;
use App\Modules\Vehicles\Models\Enums\Compatibility;
use App\Modules\Vehicles\Models\Enums\CurrentType;
use App\Modules\Vehicles\Services\VehicleMasterService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ConnectorTypeController extends Controller
{
    public function __construct(private readonly VehicleMasterService $master) {}

    public function index(Request $request): Response
    {
        $connectors = ConnectorType::query()->ordered()->get()
            ->map(fn (ConnectorType $c) => [
                'id' => $c->id, 'code' => $c->code, 'name_ar' => $c->name_ar, 'name_en' => $c->name_en, 'name' => $c->name(),
                'current_type' => $c->current_type->value, 'is_active' => $c->is_active, 'sort_order' => $c->sort_order,
            ])->values()->all();

        $rules = ConnectorCompatibilityRule::query()->with('verifier')->get()
            ->map(fn (ConnectorCompatibilityRule $r) => [
                'vehicle_connector_type_id' => $r->vehicle_connector_type_id,
                'station_connector_type_id' => $r->station_connector_type_id,
                'compatibility' => $r->compatibility->value,
                'adapter_name' => $r->adapter_name,
                'notes' => $r->notes,
                'verified_by' => $r->verifier?->name,
                'verified_at' => $r->verified_at?->toIso8601String(),
            ])->values()->all();

        return Inertia::render('admin/vehicles/connectors', [
            'connectors' => $connectors,
            'rules' => $rules,
            'compatibilityOptions' => Compatibility::options(),
            'currentTypes' => CurrentType::options(),
            'canManage' => $request->user()->can('vehicles.manage_master'),
        ]);
    }

    public function store(ConnectorTypeRequest $request): RedirectResponse
    {
        $this->master->saveConnectorType($request->validated(), null, $request->user());

        return back()->with('success', __('vehicles.flash.connector_saved'));
    }

    public function update(ConnectorTypeRequest $request, ConnectorType $connector): RedirectResponse
    {
        $this->master->saveConnectorType($request->validated(), $connector, $request->user());

        return back()->with('success', __('vehicles.flash.connector_saved'));
    }

    public function toggle(Request $request, ConnectorType $connector): RedirectResponse
    {
        $connector = $this->master->toggleConnectorType($connector, $request->user());

        return back()->with('success', __($connector->is_active ? 'vehicles.flash.activated' : 'vehicles.flash.deactivated'));
    }
}
