<?php

namespace App\Http\Controllers\Api;

use App\Domain\Field\DayClosingService;
use App\Domain\Field\VanLoadService;
use App\Models\DayClosing;
use App\Models\RepLocation;
use App\Models\RepShift;
use App\Models\VanLoad;
use App\Models\Vehicle;
use App\Support\CompanyContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FieldOpsController extends BaseApiController
{
    public function __construct(
        private readonly VanLoadService $vanLoads,
        private readonly DayClosingService $dayClosings,
    ) {}

    // ------------------------------------------------------------- van loads

    public function storeVanLoad(Request $request): JsonResponse
    {
        $data = $request->validate([
            'header.vehicle_id' => ['required', 'integer', 'exists:vehicles,id'],
            'header.rep_id' => ['required', 'integer', 'exists:users,id'],
            'header.driver_id' => ['nullable', 'integer', 'exists:users,id'],
            'header.from_warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'header.load_date' => ['nullable', 'date'],
            'header.kind' => ['nullable', 'in:load,reload,return,van_to_van'],
            'header.counterpart_vehicle_id' => ['nullable', 'integer', 'exists:vehicles,id'],
            'header.notes' => ['nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'lines.*.item_unit_id' => ['nullable', 'integer', 'exists:item_units,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.batch_id' => ['nullable', 'integer', 'exists:batches,id'],
            'lines.*.scanned' => ['nullable', 'boolean'],
            'issue' => ['nullable', 'boolean'],
        ]);

        $load = $this->vanLoads->create($data['header'], $data['lines']);

        if ($data['issue'] ?? false) {
            $load = $this->vanLoads->issue($load);
        }

        return response()->json(['van_load' => $load->load('lines')], 201);
    }

    public function issueVanLoad(VanLoad $vanLoad): JsonResponse
    {
        return response()->json(['van_load' => $this->vanLoads->issue($vanLoad)->load('lines')]);
    }

    public function receiveVanLoad(Request $request, VanLoad $vanLoad): JsonResponse
    {
        $data = $request->validate([
            'lines' => ['nullable', 'array'],
            'lines.*.line_id' => ['required', 'integer'],
            'lines.*.qty_received_base' => ['required', 'numeric', 'min:0'],
        ]);

        return response()->json([
            'van_load' => $this->vanLoads->receive($vanLoad, $data['lines'] ?? null)->load('lines'),
        ]);
    }

    /** End-of-day return of unsold stock from the van to a warehouse. */
    public function returnVanStock(Request $request): JsonResponse
    {
        $data = $request->validate([
            'vehicle_id' => ['required', 'integer', 'exists:vehicles,id'],
            'rep_id' => ['required', 'integer', 'exists:users,id'],
            'to_warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'lines.*.item_unit_id' => ['nullable', 'integer'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.batch_id' => ['nullable', 'integer'],
        ]);

        $load = $this->vanLoads->returnToWarehouse(
            Vehicle::findOrFail($data['vehicle_id']),
            $data['rep_id'],
            $data['to_warehouse_id'],
            $data['lines']
        );

        return response()->json(['van_load' => $load->load('lines')]);
    }

    /** Live van stock for a vehicle. */
    public function vanStock(Request $request, Vehicle $vehicle): JsonResponse
    {
        $warehouse = $this->vanLoads->vanWarehouseFor($vehicle);

        return response()->json([
            'warehouse' => ['id' => $warehouse->id, 'name' => $warehouse->name],
            'lines' => DB::table('stock_balances as sb')
                ->join('items as i', 'i.id', '=', 'sb.item_id')
                ->leftJoin('batches as b', 'b.id', '=', 'sb.batch_id')
                ->where('sb.warehouse_id', $warehouse->id)
                ->where('sb.qty_on_hand', '<>', 0)
                ->select(['i.id as item_id', 'i.code', 'i.name', 'b.code as batch',
                    'b.expiry_date', 'sb.qty_on_hand', 'sb.qty_reserved',
                    DB::raw('sb.qty_on_hand - sb.qty_reserved AS qty_available')])
                ->orderBy('i.code')
                ->get(),
        ]);
    }

    // ----------------------------------------------------------- day closing

    public function openDay(Request $request): JsonResponse
    {
        $data = $request->validate([
            'rep_id' => ['required', 'integer', 'exists:users,id'],
            'business_date' => ['nullable', 'date'],
            'vehicle_id' => ['nullable', 'integer', 'exists:vehicles,id'],
        ]);

        $closing = $this->dayClosings->open(
            $data['rep_id'],
            $data['business_date'] ?? now()->toDateString(),
            $data['vehicle_id'] ?? null
        );

        return response()->json(['day_closing' => $this->dayClosings->compute($closing)->load('stockLines')]);
    }

    public function showDay(Request $request, DayClosing $dayClosing): JsonResponse
    {
        if ($dayClosing->rep_id !== $request->user()->id
            && ! $request->user()->hasPermission('field.day_closing.view.all')) {
            abort(403, 'لا تملك صلاحية الاطلاع على إقفال مندوب آخر.');
        }

        $dayClosing->load(['stockLines.item:id,code,name', 'rep:id,name']);

        return response()->json(['day_closing' => $dayClosing]);
    }

    public function recomputeDay(DayClosing $dayClosing): JsonResponse
    {
        return response()->json([
            'day_closing' => $this->dayClosings->compute($dayClosing)->load('stockLines.item:id,code,name'),
        ]);
    }

    public function submitDay(Request $request, DayClosing $dayClosing): JsonResponse
    {
        $data = $request->validate([
            'actual_cash' => ['required', 'numeric', 'min:0'],
            'counted_stock' => ['nullable', 'array'],
            'counted_stock.*.line_id' => ['required', 'integer'],
            'counted_stock.*.counted_qty' => ['required', 'numeric', 'min:0'],
        ]);

        $closing = $this->dayClosings->submit(
            $dayClosing, $data['actual_cash'], $data['counted_stock'] ?? []
        );

        return response()->json(['day_closing' => $closing->load('stockLines')]);
    }

    public function approveDay(Request $request, DayClosing $dayClosing): JsonResponse
    {
        $data = $request->validate([
            'sync_override_reason' => ['nullable', 'string', 'max:500'],
            'notes' => ['nullable', 'string'],
        ]);

        // Overriding the sync requirement is its own permission — a supervisor
        // cannot grant it to themselves by sending a reason string.
        if (! empty($data['sync_override_reason'])
            && ! $request->user()->hasPermission('field.day_closing.sync_override')) {
            abort(403, 'لا تملك صلاحية الإقفال قبل اكتمال المزامنة.');
        }

        return response()->json([
            'day_closing' => $this->dayClosings->approve($dayClosing, $data)->load('stockLines'),
        ]);
    }

    public function reopenDay(Request $request, DayClosing $dayClosing): JsonResponse
    {
        $reason = $request->validate(['reason' => ['required', 'string', 'max:500']])['reason'];

        return response()->json(['day_closing' => $this->dayClosings->reopen($dayClosing, $reason)]);
    }

    // --------------------------------------------------------- shifts & GPS

    public function startShift(Request $request): JsonResponse
    {
        $data = $request->validate([
            'device_id' => ['nullable', 'integer', 'exists:devices,id'],
            'location_consent' => ['required', 'boolean'],
        ]);

        $shift = RepShift::create([
            'company_id' => CompanyContext::idOrFail(),
            'rep_id' => $request->user()->id,
            'device_id' => $data['device_id'] ?? null,
            'business_date' => now()->toDateString(),
            'started_at' => now(),
            'location_consent' => $data['location_consent'],
        ]);

        return response()->json(['shift' => $shift], 201);
    }

    public function endShift(Request $request, RepShift $shift): JsonResponse
    {
        $shift->forceFill(['ended_at' => now()])->save();

        return response()->json(['shift' => $shift]);
    }

    /**
     * Location points are accepted only while a shift is open and consent was
     * given. Outside those conditions the request is refused, not silently
     * stored — the system does not track reps off the clock.
     */
    public function recordLocations(Request $request): JsonResponse
    {
        $data = $request->validate([
            'points' => ['required', 'array', 'max:200'],
            'points.*.recorded_at' => ['required', 'date'],
            'points.*.lat' => ['required', 'numeric', 'between:-90,90'],
            'points.*.lng' => ['required', 'numeric', 'between:-180,180'],
            'points.*.accuracy_m' => ['nullable', 'numeric', 'min:0'],
            'points.*.battery_pct' => ['nullable', 'integer', 'between:0,100'],
            'device_id' => ['nullable', 'integer', 'exists:devices,id'],
        ]);

        $shift = RepShift::query()
            ->where('rep_id', $request->user()->id)
            ->whereNull('ended_at')
            ->latest('started_at')
            ->first();

        if (! $shift || ! $shift->location_consent) {
            return response()->json([
                'error' => 'field.no_active_shift',
                'message' => 'لا يتم تسجيل الموقع خارج الوردية أو بدون إذن صريح.',
            ], 422);
        }

        $retentionDays = (int) ($request->user()->company?->setting('privacy.location_retention_days', 90) ?? 90);

        $rows = collect($data['points'])->map(fn ($p) => [
            'company_id' => CompanyContext::idOrFail(),
            'rep_id' => $request->user()->id,
            'device_id' => $data['device_id'] ?? $shift->device_id,
            'recorded_at' => $p['recorded_at'],
            'lat' => $p['lat'],
            'lng' => $p['lng'],
            'accuracy_m' => $p['accuracy_m'] ?? null,
            'battery_pct' => $p['battery_pct'] ?? null,
            'shift_active' => true,
            'retention_until' => now()->addDays($retentionDays)->toDateString(),
            'created_at' => now(),
        ])->all();

        RepLocation::insert($rows);

        return response()->json(['stored' => count($rows)]);
    }

    /**
     * Supervisor view of rep positions.
     *
     * The age and accuracy of each fix are returned alongside it and the
     * response is explicit that this is a LAST KNOWN position, not a live one —
     * a stale fix must not be read as "the rep is here now".
     */
    public function repPositions(Request $request): JsonResponse
    {
        $rows = DB::table('rep_locations as rl')
            ->join('users as u', 'u.id', '=', 'rl.rep_id')
            ->where('rl.company_id', CompanyContext::idOrFail())
            ->whereIn('rl.id', function ($q) {
                $q->from('rep_locations')
                    ->selectRaw('MAX(id)')
                    ->whereDate('recorded_at', '>=', now()->subDay()->toDateString())
                    ->groupBy('rep_id');
            })
            ->select(['rl.rep_id', 'u.name', 'rl.lat', 'rl.lng', 'rl.accuracy_m', 'rl.recorded_at'])
            ->get()
            ->map(function ($row) {
                $ageMinutes = now()->diffInMinutes(\Illuminate\Support\Carbon::parse($row->recorded_at));
                $row->age_minutes = $ageMinutes;
                $row->is_recent = $ageMinutes <= 15;

                return $row;
            });

        return response()->json([
            'positions' => $rows,
            'disclaimer' => 'هذه آخر مواقع معروفة وليست مواقع لحظية. غياب التحديث قد يعني ضعف الشبكة أو انقطاع GPS، ولا يُعد دليلًا على مخالفة.',
        ]);
    }
}
