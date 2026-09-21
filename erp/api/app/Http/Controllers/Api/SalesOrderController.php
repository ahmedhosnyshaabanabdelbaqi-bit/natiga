<?php

namespace App\Http\Controllers\Api;

use App\Domain\Sales\DeliveryService;
use App\Domain\Sales\SalesOrderService;
use App\Models\SalesOrder;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SalesOrderController extends BaseApiController
{
    protected array $sortable = ['code', 'order_date', 'total', 'created_at'];

    protected array $searchable = ['sales_orders.code', 'sales_orders.customer_po_ref'];

    public function __construct(
        private readonly SalesOrderService $orders,
        private readonly DeliveryService $deliveries,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = $this->scopedQuery($request)
            ->with(['customer:id,code,name', 'rep:id,name', 'warehouse:id,name'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('delivery_status'), fn ($q) => $q->where('delivery_status', $request->string('delivery_status')))
            ->when($request->filled('customer_id'), fn ($q) => $q->where('customer_id', $request->integer('customer_id')))
            ->when($request->filled('from'), fn ($q) => $q->where('order_date', '>=', $request->string('from')))
            ->when($request->filled('to'), fn ($q) => $q->where('order_date', '<=', $request->string('to')));

        return $this->paginated($query, $request, fn (SalesOrder $o) => [
            'id' => $o->id,
            'code' => $o->code,
            'order_date' => $o->order_date->toDateString(),
            'customer' => $o->customer?->name,
            'rep' => $o->rep?->name,
            'warehouse' => $o->warehouse?->name,
            'payment_type' => $o->payment_type,
            'status' => $o->status,
            // Three independent axes, reported as three fields — never collapsed.
            'delivery_status' => $o->delivery_status,
            'invoice_status' => $o->invoice_status,
            'payment_status' => $o->payment_status,
            'total' => (string) $o->total,
        ]);
    }

    public function show(Request $request, SalesOrder $salesOrder): JsonResponse
    {
        $this->authorizeReach($request, $salesOrder);

        $salesOrder->load(['lines.item:id,code,name', 'lines.itemUnit.unit:id,name',
            'customer', 'rep:id,name', 'warehouse:id,name', 'deliveryNotes', 'invoices']);

        return response()->json(['order' => $salesOrder]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateOrder($request);

        $order = $this->orders->create($data['header'], $data['lines']);

        return response()->json(['order' => $order->load('lines')], 201);
    }

    public function update(Request $request, SalesOrder $salesOrder): JsonResponse
    {
        $this->authorizeReach($request, $salesOrder);

        $data = $this->validateOrder($request, partial: true);

        $order = $this->orders->update($salesOrder, $data['header'] ?? [], $data['lines'] ?? null);

        return response()->json(['order' => $order->load('lines')]);
    }

    public function approve(Request $request, SalesOrder $salesOrder): JsonResponse
    {
        $this->authorizeReach($request, $salesOrder);

        // Overriding a credit block is its own permission, checked here rather
        // than trusted from the request body.
        $override = $request->boolean('credit_override')
            && $request->user()->hasPermission('sales.credit.override');

        $order = $this->orders->approve($salesOrder, $override);

        return response()->json([
            'order' => $order->load('lines'),
            'message' => 'تم اعتماد أمر البيع وحجز الكميات المتاحة.',
        ]);
    }

    public function cancel(Request $request, SalesOrder $salesOrder): JsonResponse
    {
        $this->authorizeReach($request, $salesOrder);

        $reason = $request->validate(['reason' => ['required', 'string', 'max:500']])['reason'];

        return response()->json(['order' => $this->orders->cancel($salesOrder, $reason)]);
    }

    /** Create the picking / delivery document for this order. */
    public function createDelivery(Request $request, SalesOrder $salesOrder): JsonResponse
    {
        $this->authorizeReach($request, $salesOrder);

        $data = $request->validate([
            'delivery_date' => ['nullable', 'date'],
            'vehicle_id' => ['nullable', 'integer', 'exists:vehicles,id'],
            'driver_id' => ['nullable', 'integer', 'exists:users,id'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'lines' => ['nullable', 'array'],
            'lines.*.sales_order_line_id' => ['required', 'integer'],
            'lines.*.qty_base' => ['required', 'numeric', 'gt:0'],
            'lines.*.batch_id' => ['nullable', 'integer'],
        ]);

        $note = $this->deliveries->createFromOrder(
            $salesOrder,
            collect($data)->except('lines')->all(),
            $data['lines'] ?? null
        );

        return response()->json(['delivery_note' => $note->load('lines')], 201);
    }

    protected function scopedQuery(Request $request): Builder
    {
        $user = $request->user();
        $query = SalesOrder::query();

        if (! $user->hasPermission('sales.order.view.all')) {
            $query->where('rep_id', $user->id);
        }

        if ($branches = $user->scopeIds('branch')) {
            $query->whereIn('branch_id', $branches);
        }

        return $query;
    }

    protected function authorizeReach(Request $request, SalesOrder $order): void
    {
        $user = $request->user();

        if ($user->hasPermission('sales.order.view.all')) {
            return;
        }

        if ($order->rep_id !== $user->id) {
            abort(403, 'لا تملك صلاحية الوصول إلى هذا الأمر.');
        }
    }

    protected function validateOrder(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        $validated = $request->validate([
            'header' => [$required, 'array'],
            'header.customer_id' => [$partial ? 'sometimes' : 'required', 'integer', 'exists:customers,id'],
            'header.warehouse_id' => [$partial ? 'sometimes' : 'required', 'integer', 'exists:warehouses,id'],
            'header.branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'header.customer_address_id' => ['nullable', 'integer'],
            'header.rep_id' => ['nullable', 'integer', 'exists:users,id'],
            'header.price_list_id' => ['nullable', 'integer', 'exists:price_lists,id'],
            'header.cost_center_id' => ['nullable', 'integer', 'exists:cost_centers,id'],
            'header.order_date' => ['nullable', 'date'],
            'header.delivery_date' => ['nullable', 'date'],
            'header.payment_type' => ['nullable', 'in:cash,credit,mixed'],
            'header.doc_discount_amount' => ['nullable', 'numeric', 'min:0'],
            'header.delivery_fee' => ['nullable', 'numeric', 'min:0'],
            'header.customer_po_ref' => ['nullable', 'string', 'max:64'],
            'header.is_backorder_allowed' => ['nullable', 'boolean'],
            'header.notes' => ['nullable', 'string'],
            'lines' => [$required, 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'lines.*.item_unit_id' => ['nullable', 'integer', 'exists:item_units,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'lines.*.discount_pct' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'lines.*.discount_amount' => ['nullable', 'numeric', 'min:0'],
            'lines.*.note' => ['nullable', 'string', 'max:255'],
        ]);

        // A manual price or a discount above the user's ceiling needs its own
        // permission — the client cannot grant itself one by sending a number.
        $this->assertOverridesAllowed($request, $validated['lines'] ?? []);

        return $validated;
    }

    protected function assertOverridesAllowed(Request $request, array $lines): void
    {
        $user = $request->user();

        foreach ($lines as $line) {
            if (isset($line['unit_price']) && ! $user->hasPermission('sales.price.override')) {
                abort(403, 'لا تملك صلاحية تعديل السعر يدويًا.');
            }
            if (! empty($line['discount_pct']) && ! $user->hasPermission('sales.discount.override')) {
                abort(403, 'لا تملك صلاحية منح خصم على السطر.');
            }
        }
    }
}
