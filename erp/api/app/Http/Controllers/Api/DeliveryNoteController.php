<?php

namespace App\Http\Controllers\Api;

use App\Domain\Sales\DeliveryService;
use App\Domain\Sales\InvoiceService;
use App\Models\DeliveryNote;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeliveryNoteController extends BaseApiController
{
    protected array $sortable = ['code', 'delivery_date', 'created_at'];

    protected array $searchable = ['delivery_notes.code'];

    public function __construct(
        private readonly DeliveryService $deliveries,
        private readonly InvoiceService $invoices,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = DeliveryNote::query()
            ->with(['customer:id,code,name', 'warehouse:id,name', 'vehicle:id,code,plate_no'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('vehicle_id'), fn ($q) => $q->where('vehicle_id', $request->integer('vehicle_id')))
            ->when($request->filled('date'), fn ($q) => $q->where('delivery_date', $request->string('date')))
            ->when(! $request->user()->hasPermission('sales.delivery.view.all'),
                fn ($q) => $q->where('rep_id', $request->user()->id));

        return $this->paginated($query, $request, fn (DeliveryNote $n) => [
            'id' => $n->id,
            'code' => $n->code,
            'delivery_date' => $n->delivery_date->toDateString(),
            'customer' => $n->customer?->name,
            'warehouse' => $n->warehouse?->name,
            'vehicle' => $n->vehicle?->plate_no ?? $n->vehicle?->code,
            'stop_sequence' => $n->stop_sequence,
            'status' => $n->status,
            'delivered_at' => $n->delivered_at?->toIso8601String(),
        ]);
    }

    public function show(DeliveryNote $deliveryNote): JsonResponse
    {
        $deliveryNote->load(['lines.item:id,code,name', 'lines.batch:id,code,expiry_date',
            'customer', 'order:id,code', 'warehouse:id,name']);

        return response()->json(['delivery_note' => $deliveryNote]);
    }

    /**
     * Confirm what the customer actually took.
     *
     * This is the call that moves stock, which is why it is a distinct endpoint
     * with its own permission rather than a status field on an update.
     */
    public function confirm(Request $request, DeliveryNote $deliveryNote): JsonResponse
    {
        $data = $request->validate([
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.line_id' => ['required', 'integer'],
            'lines.*.qty_delivered_base' => ['required', 'numeric', 'min:0'],
            'lines.*.qty_refused_base' => ['nullable', 'numeric', 'min:0'],
            'lines.*.refusal_reason' => ['nullable', 'string', 'max:120'],
            'proof' => ['nullable', 'array'],
            'proof.received_by_name' => ['nullable', 'string', 'max:120'],
            'proof.signature_path' => ['nullable', 'string', 'max:255'],
            'proof.photos' => ['nullable', 'array'],
            'proof.otp_verified' => ['nullable', 'boolean'],
            'proof.gps_lat' => ['nullable', 'numeric'],
            'proof.gps_lng' => ['nullable', 'numeric'],
            'proof.failure_reason' => ['nullable', 'string', 'max:120'],
            'invoice_now' => ['nullable', 'boolean'],
        ]);

        $note = $this->deliveries->confirmDelivery($deliveryNote, $data['lines'], $data['proof'] ?? []);

        $invoice = null;
        if (($data['invoice_now'] ?? false)
            && $note->hasLeftStock()
            && $request->user()->hasPermission('sales.invoice.create')) {
            $invoice = $this->invoices->createFromDelivery($note);
        }

        return response()->json([
            'delivery_note' => $note->load('lines'),
            'invoice' => $invoice?->load('lines'),
        ]);
    }

    public function fail(Request $request, DeliveryNote $deliveryNote): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'max:120'],
            'reschedule_to' => ['nullable', 'date', 'after_or_equal:today'],
        ]);

        return response()->json([
            'delivery_note' => $this->deliveries->markFailed(
                $deliveryNote, $data['reason'], $data['reschedule_to'] ?? null
            ),
        ]);
    }
}
