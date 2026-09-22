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
use Inertia\Inertia;
use Inertia\Response;

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
            ->orderByDesc('created_at')->get();

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
            'marketVersions' => MarketVersion::options(),
            'maxImageMb' => $attachments->maxMegabytes('image'),
            'supportUrl' => '/account/support',
        ]);
    }

    public function store(StoreVehicleRequest $request, CreateMemberVehicle $create): RedirectResponse
    {
        $vehicle = $create->execute($request->user(), $request->validated(), $request->file('image'), $request->user());

        return redirect()->route('member.garage.show', $vehicle)->with('success', __('garage.flash.created', ['name' => $vehicle->displayName()]));
    }

    public function show(Request $request, MemberVehicle $vehicle): Response
    {
        $this->authorize('view', $vehicle);
        $user = $request->user();
        $vehicle->load(['make', 'model', 'variant', 'battery', 'image']);
        $sections = GarageSections::tabsFor($user);

        $props = [
            'vehicle' => $this->presenter->detail($vehicle),
            'sections' => $sections,
            'statuses' => VehicleStatus::options(),
            'canUpdate' => $user->can('update', $vehicle),
            'canDelete' => $user->can('delete', $vehicle),
            'canRevealVin' => $user->can('revealVin', $vehicle) && $vehicle->hasVin(),
        ];
        // Each section resolves lazily after first paint (one partial reload for the whole group).
        foreach ($sections as $section) {
            $key = $section['key'];
            $props['section_'.$key] = Inertia::defer(fn () => GarageSections::resolve($key, $vehicle, $user), 'garage-sections');
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
            'vehicleData' => $this->data->forLocale(app()->getLocale()),
            'marketVersions' => MarketVersion::options(),
            'maxImageMb' => $attachments->maxMegabytes('image'),
            'supportUrl' => '/account/support',
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
}
