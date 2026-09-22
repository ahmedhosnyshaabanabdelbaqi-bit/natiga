<?php

namespace App\Modules\Garage\Http\Controllers\Member;

use App\Http\Controllers\Controller;
use App\Modules\Files\Services\AttachmentService;
use App\Modules\Garage\Http\Requests\StoreVehicleRequest;
use App\Modules\Garage\Http\Requests\UpdateVehicleRequest;
use App\Modules\Garage\Services\GarageSections;
use App\Modules\Vehicles\Actions\CreateMemberVehicle;
use App\Modules\Vehicles\Actions\DeleteMemberVehicle;
use App\Modules\Vehicles\Actions\UpdateMemberVehicle;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Services\MemberVehiclePresenter;
use App\Modules\Vehicles\Services\VehicleDataService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Inertia\Response;

/**
 * My Garage (/account/garage). Every route binds the vehicle by its ULID public_id and authorizes it
 * against the owner-only policy abilities (viewOwn / update / delete).
 */
class GarageController extends Controller
{
    public function __construct(private readonly MemberVehiclePresenter $presenter, private readonly VehicleDataService $data) {}

    public function index(Request $request): Response
    {
        $this->authorize('viewAny', MemberVehicle::class);
        $user = $request->user();
        $vehicles = MemberVehicle::query()->forUser($user)->with(['make', 'model', 'variant', 'image'])
            ->orderByDesc('is_primary')
            ->orderByRaw("CASE status WHEN 'active' THEN 0 WHEN 'sold' THEN 1 ELSE 2 END")
            ->orderByDesc('created_at')->orderByDesc('id')->get();

        return Inertia::render('member/garage/index', [
            'vehicles' => $vehicles->map(fn (MemberVehicle $v) => $this->presenter->card($v))->values()->all(),
            'counts' => [
                'active' => $vehicles->where('status', VehicleStatus::Active)->count(),
                'inactive' => $vehicles->where('status', '!=', VehicleStatus::Active)->count(),
            ],
            'canAdd' => $user->can('create', MemberVehicle::class),
        ]);
    }

    public function create(Request $request, AttachmentService $attachments): Response
    {
        $this->authorize('create', MemberVehicle::class);

        return Inertia::render('member/garage/create', [
            'vehicleData' => $this->data->forLocale(app()->getLocale()),
            'maxImageMb' => $attachments->maxMegabytes('image'),
            'supportUrl' => $this->supportUrl(),
        ]);
    }

    public function store(StoreVehicleRequest $request, CreateMemberVehicle $create): RedirectResponse
    {
        $vehicle = $create->execute($request->user(), $request->validated(), $request->file('image'), $request->user());

        return redirect()->route('member.garage.show', $vehicle)->with('success', __('garage.flash.created', ['name' => $vehicle->displayName()]));
    }

    public function show(Request $request, MemberVehicle $vehicle): Response
    {
        $this->authorize('viewOwn', $vehicle);
        $user = $request->user();
        $vehicle->load(['make', 'model', 'variant', 'battery', 'image']);
        $sections = GarageSections::tabsFor($user);
        $keys = array_column($sections, 'key');
        $requested = (string) $request->query('tab', '');
        $active = in_array($requested, $keys, true) ? $requested : ($keys[0] ?? null);

        $props = [
            'vehicle' => $this->presenter->detail($vehicle),
            'sections' => $sections,
            'activeSection' => $active,
            'statuses' => VehicleStatus::options(),
            'canUpdate' => $user->can('update', $vehicle),
            'canDelete' => $user->can('delete', $vehicle),
            'canRevealVin' => $user->can('revealVin', $vehicle) && $vehicle->hasVin(),
        ];
        // Section data is resolved lazily: the active tab is a deferred prop (fetched right after first
        // paint); the other tabs are optional props fetched by a partial reload when they are opened.
        foreach ($keys as $key) {
            $resolver = fn () => GarageSections::resolve($key, $vehicle, $user);
            $props['section_'.$key] = $key === $active ? Inertia::defer($resolver, 'garage-section') : Inertia::optional($resolver);
        }

        return Inertia::render('member/garage/show', $props);
    }

    public function edit(Request $request, MemberVehicle $vehicle, AttachmentService $attachments): Response
    {
        $this->authorize('update', $vehicle);
        $vehicle->load(['make', 'model', 'variant', 'battery', 'image']);

        return Inertia::render('member/garage/edit', [
            'vehicle' => $this->presenter->detail($vehicle) + [
                'vehicle_make_id' => $vehicle->vehicle_make_id,
                'vehicle_model_id' => $vehicle->vehicle_model_id,
                'vehicle_variant_id' => $vehicle->vehicle_variant_id,
                'battery_variant_id' => $vehicle->battery_variant_id,
            ],
            // The current selection, so the form can show it even if an admin deactivated it since.
            'currentSelection' => [
                'make' => ['id' => $vehicle->make->id, 'name' => $vehicle->make->name()],
                'model' => ['id' => $vehicle->model->id, 'name' => $vehicle->model->name()],
                'variant' => $vehicle->variant ? [
                    'id' => $vehicle->variant->id,
                    'name' => $vehicle->variant->name(),
                    'trim' => $vehicle->variant->trim,
                    'market_version' => $vehicle->variant->market_version->value,
                    'year_from' => $vehicle->variant->year_from,
                    'year_to' => $vehicle->variant->year_to,
                    'battery_variant_id' => $vehicle->variant->battery_variant_id,
                    'battery_capacity_kwh' => $vehicle->variant->battery_capacity_kwh !== null ? (string) $vehicle->variant->battery_capacity_kwh : null,
                    'ac_connector_type_id' => $vehicle->variant->ac_connector_type_id,
                    'dc_connector_type_id' => $vehicle->variant->dc_connector_type_id,
                    'is_active' => $vehicle->variant->is_active,
                ] : null,
            ],
            'vehicleData' => $this->data->forLocale(app()->getLocale()),
            'maxImageMb' => $attachments->maxMegabytes('image'),
            'supportUrl' => $this->supportUrl(),
        ]);
    }

    public function update(UpdateVehicleRequest $request, MemberVehicle $vehicle, UpdateMemberVehicle $update): RedirectResponse
    {
        $update->execute($vehicle, $request->validated(), $request->file('image'), $request->boolean('remove_image'), $request->user());

        return redirect()->route('member.garage.show', $vehicle)->with('success', __('garage.flash.updated'));
    }

    public function destroy(Request $request, MemberVehicle $vehicle, DeleteMemberVehicle $delete): RedirectResponse
    {
        $this->authorize('delete', $vehicle);
        $reason = $request->validate(['reason' => ['nullable', 'string', 'max:500']])['reason'] ?? null;
        $delete->execute($vehicle, $request->user(), $reason);

        return redirect()->route('member.garage.index')->with('success', __('garage.flash.deleted'));
    }

    /** Where a member disputes a duplicate VIN (only when the support module exposes a member page). */
    private function supportUrl(): ?string
    {
        foreach (['member.support.create', 'member.support.index', 'member.support.tickets.create', 'member.support.tickets.index'] as $name) {
            if (Route::has($name)) {
                return route($name, [], false);
            }
        }

        return null;
    }
}
