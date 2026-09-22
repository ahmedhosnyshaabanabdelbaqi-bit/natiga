<?php

namespace App\Modules\Vehicles\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Vehicles\Actions\CorrectMemberVehicle;
use App\Modules\Vehicles\Http\Requests\CorrectMemberVehicleRequest;
use App\Modules\Vehicles\Http\Requests\VinLookupRequest;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Models\VehicleMake;
use App\Modules\Vehicles\Models\VehicleModel;
use App\Modules\Vehicles\Services\MemberVehiclePresenter;
use App\Modules\Vehicles\Services\VehicleDataService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Staff view of member vehicles. VINs are never listed; a VIN can only be *looked up*
 * (POST, hashed, audited) and the matching vehicle is shown. Corrections require
 * vehicles.edit_member_vehicle and a reason.
 */
class MemberVehicleController extends Controller
{
    use AuthorizesRequests;

    public const VIN_LOOKUP_SESSION_KEY = 'vehicles.admin.vin_lookup';

    public function __construct(private readonly MemberVehiclePresenter $presenter, private readonly AuditService $audit) {}

    public function index(Request $request): Response
    {
        $this->authorize('viewAny', MemberVehicle::class);

        $filters = [
            'q' => mb_substr(trim((string) $request->query('q', '')), 0, 100),
            'make' => $request->integer('make') ?: null,
            'model' => $request->integer('model') ?: null,
            'year' => $request->integer('year') ?: null,
            'status' => in_array($request->query('status'), VehicleStatus::values(), true) ? (string) $request->query('status') : null,
            'variant' => $request->query('variant') === 'missing' ? 'missing' : null,
        ];
        $vinHash = $request->session()->get(self::VIN_LOOKUP_SESSION_KEY);
        $vinLookupActive = is_string($vinHash) && strlen($vinHash) === 64;

        $query = MemberVehicle::query()->with(['make', 'model', 'variant', 'user', 'membership']);
        if ($vinLookupActive) {
            $query->where('vin_hash', $vinHash);
        } else {
            $query->when($filters['q'] !== '', function ($q) use ($filters) {
                $term = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $filters['q']).'%';
                $q->where(fn ($w) => $w->whereHas('membership', fn ($m) => $m->where('member_number', 'ILIKE', $term))
                    ->orWhereHas('user', fn ($u) => $u->where('name', 'ILIKE', $term)->orWhere('email', 'ILIKE', $term)));
            })
                ->when($filters['make'], fn ($q, $v) => $q->where('vehicle_make_id', $v))
                ->when($filters['model'], fn ($q, $v) => $q->where('vehicle_model_id', $v))
                ->when($filters['year'], fn ($q, $v) => $q->where('year', $v))
                ->when($filters['status'], fn ($q, $v) => $q->where('status', $v))
                ->when($filters['variant'] === 'missing', fn ($q) => $q->whereNull('vehicle_variant_id'));
        }
        $paginator = $query->orderByDesc('created_at')->orderByDesc('id')->paginate(25)->withQueryString();
        $paginator->getCollection()->transform(fn (MemberVehicle $v) => $this->presenter->adminRow($v));

        return Inertia::render('admin/vehicles/members/index', [
            'vehicles' => $paginator,
            'filters' => $filters,
            'vinLookup' => $vinLookupActive ? ['active' => true, 'matched' => $paginator->total() > 0] : null,
            'makes' => VehicleMake::query()->ordered()->get()->map(fn (VehicleMake $m) => ['id' => $m->id, 'name' => $m->name()])->values()->all(),
            'models' => $filters['make'] ? VehicleModel::query()->where('vehicle_make_id', $filters['make'])->ordered()->get()->map(fn (VehicleModel $m) => ['id' => $m->id, 'name' => $m->name()])->values()->all() : [],
            'statuses' => VehicleStatus::options(),
        ]);
    }

    /** VIN lookup by hash: the VIN itself never reaches the URL, the logs or the audit trail. */
    public function vinLookup(VinLookupRequest $request): RedirectResponse
    {
        $hash = MemberVehicle::hashVin($request->validated('vin'));
        $matches = MemberVehicle::query()->where('vin_hash', $hash)->count();
        $this->audit->log('vehicles.vin_lookup', null, new: ['matches' => $matches], actor: $request->user());
        $request->session()->flash(self::VIN_LOOKUP_SESSION_KEY, $hash);

        return redirect()->route('admin.vehicles.members.index');
    }

    public function show(Request $request, MemberVehicle $vehicle, VehicleDataService $data): Response
    {
        $this->authorize('view', $vehicle);
        $vehicle->load(['make', 'model', 'variant.battery', 'variant.acConnector', 'variant.dcConnector', 'battery', 'user', 'membership', 'image']);
        $canCorrect = $request->user()->can('adminUpdate', $vehicle);

        return Inertia::render('admin/vehicles/members/show', [
            'vehicle' => $this->presenter->adminRow($vehicle) + [
                'plate_hint' => $vehicle->plate_hint,
                'battery_capacity_kwh' => $vehicle->batteryCapacityKwh(),
                'vehicle_make_id' => $vehicle->vehicle_make_id,
                'vehicle_model_id' => $vehicle->vehicle_model_id,
                'vehicle_variant_id' => $vehicle->vehicle_variant_id,
                'battery_variant_id' => $vehicle->battery_variant_id,
                'info' => $this->presenter->info($vehicle),
            ],
            'odometerHistory' => $this->presenter->odometerHistory($vehicle->odometerHistory()->with('creator')->limit(200)->get()),
            'memberUrl' => $vehicle->membership && Route::has('admin.members.show') && $request->user()->can('members.view')
                ? route('admin.members.show', $vehicle->membership, false) : null,
            'canCorrect' => $canCorrect,
            'catalog' => $canCorrect ? $data->catalog(app()->getLocale(), includeInactive: true) : null,
            'marketVersions' => MarketVersion::options(),
            'statuses' => VehicleStatus::options(),
        ]);
    }

    public function update(CorrectMemberVehicleRequest $request, MemberVehicle $vehicle, CorrectMemberVehicle $correct): RedirectResponse
    {
        $correct->execute($vehicle, $request->validated(), $request->user());

        return redirect()->route('admin.vehicles.members.show', $vehicle)->with('success', __('vehicles.flash.member_vehicle_corrected'));
    }
}
