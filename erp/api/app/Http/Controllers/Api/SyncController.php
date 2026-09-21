<?php

namespace App\Http\Controllers\Api;

use App\Domain\Credit\CreditService;
use App\Domain\Sync\SyncPullService;
use App\Domain\Sync\SyncService;
use App\Models\Customer;
use App\Models\Device;
use App\Models\SyncConflict;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The mobile app's entire server surface for offline work.
 *
 * push() is safe to call repeatedly with the same operations — each one is
 * keyed, and a replay returns the original receipt.
 */
class SyncController extends BaseApiController
{
    public function __construct(
        private readonly SyncService $sync,
        private readonly SyncPullService $pull,
        private readonly CreditService $credit,
    ) {}

    public function pull(Request $request): JsonResponse
    {
        $device = $this->resolveDevice($request);

        return response()->json($this->pull->pull($device, $request->input('since')));
    }

    public function push(Request $request): JsonResponse
    {
        $data = $request->validate([
            'device_uid' => ['required', 'string'],
            'operations' => ['required', 'array', 'max:500'],
            'operations.*.id' => ['nullable', 'uuid'],
            'operations.*.idempotency_key' => ['required', 'string', 'max:128'],
            'operations.*.client_seq' => ['required', 'integer', 'min:0'],
            'operations.*.op_type' => ['required', 'string', 'max:48'],
            'operations.*.payload' => ['required', 'array'],
            'operations.*.depends_on' => ['nullable', 'uuid'],
            'operations.*.client_created_at' => ['nullable', 'date'],
            'operations.*.app_version' => ['nullable', 'string', 'max:24'],
        ]);

        $device = $this->resolveDevice($request);
        $receipts = $this->sync->push($device, $data['operations']);

        return response()->json([
            'receipts' => $receipts,
            'summary' => [
                'applied' => collect($receipts)->where('status', 'applied')->count(),
                'rejected' => collect($receipts)->where('status', 'rejected')->count(),
                'conflict' => collect($receipts)->where('status', 'conflict')->count(),
                'pending' => collect($receipts)->where('status', 'pending')->count(),
            ],
            'server_time' => now()->toIso8601String(),
        ]);
    }

    /** What the device still owes the server, and why anything failed. */
    public function status(Request $request): JsonResponse
    {
        $device = $this->resolveDevice($request);

        return response()->json([
            'device' => [
                'id' => $device->id,
                'status' => $device->status,
                'last_sync_at' => $device->last_sync_at?->toIso8601String(),
                'last_client_seq' => $device->last_client_seq,
            ],
            'operations' => \App\Models\SyncOperation::query()
                ->where('device_id', $device->id)
                ->whereIn('status', ['pending', 'rejected', 'conflict'])
                ->orderBy('client_seq')
                ->get()
                ->map->toReceipt(),
        ]);
    }

    public function conflicts(Request $request): JsonResponse
    {
        $query = SyncConflict::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')),
                fn ($q) => $q->where('status', 'open'))
            ->orderByDesc('created_at');

        return $this->paginated($query, $request, fn (SyncConflict $c) => [
            'id' => $c->id,
            'operation_id' => $c->sync_operation_id,
            'kind' => $c->kind,
            'details' => $c->details,
            'status' => $c->status,
            'created_at' => $c->created_at?->toIso8601String(),
        ]);
    }

    /**
     * Resolve a conflict by recording a decision.
     *
     * Resolution never rewrites the original field operation — it records what a
     * human decided about it.
     */
    public function resolveConflict(Request $request, SyncConflict $conflict): JsonResponse
    {
        $data = $request->validate([
            'resolution' => ['required', 'in:accepted,rejected,adjusted,deferred'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $conflict->forceFill([
            'status' => 'resolved',
            'resolution' => $data['resolution'],
            'resolved_by' => $request->user()->id,
            'resolved_at' => now(),
            'note' => $data['note'] ?? null,
        ])->save();

        return response()->json(['conflict' => $conflict]);
    }

    /**
     * Hand a device a slice of a customer's credit limit to spend offline.
     *
     * It counts inside the customer's central exposure immediately, so no other
     * channel can spend the same headroom.
     */
    public function grantCredit(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'device_id' => ['required', 'integer', 'exists:devices,id'],
            'rep_id' => ['required', 'integer', 'exists:users,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'hours' => ['nullable', 'integer', 'min:1', 'max:168'],
        ]);

        $reservation = $this->credit->reserveForDevice(
            Customer::findOrFail($data['customer_id']),
            $data['device_id'],
            $data['rep_id'],
            $data['amount'],
            now()->addHours($data['hours'] ?? 24)
        );

        return response()->json(['reservation' => $reservation], 201);
    }

    protected function resolveDevice(Request $request): Device
    {
        $uid = $request->input('device_uid') ?? $request->header('X-Device-Uid');

        $device = Device::query()
            ->where('device_uid', $uid)
            ->where('user_id', $request->user()->id)
            ->first();

        if (! $device) {
            abort(403, 'الجهاز غير مسجل لهذا المستخدم.');
        }

        return $device;
    }
}
