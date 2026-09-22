<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Modules\Purchasing\Models\GoodsReceipt;
use App\Modules\Purchasing\Models\PurchaseOrder;
use App\Modules\Purchasing\Models\Supplier;
use App\Modules\Purchasing\Services\PurchaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;

class PurchaseController extends Controller
{
    public function __construct(private readonly PurchaseService $purchases) {}

    public function suppliers(Request $request): JsonResponse
    {
        return response()->json(
            Supplier::query()
                ->when($request->query('q'), fn ($q, $v) => $q->where('name', 'ILIKE', '%'.$v.'%'))
                ->where('is_active', true)
                ->orderBy('name')
                ->paginate(min((int) $request->query('per_page', 25), 200))
        );
    }

    public function storeSupplier(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'phone' => ['nullable', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:160'],
            'address' => ['nullable', 'string', 'max:500'],
            'tax_number' => ['nullable', 'string', 'max:64'],
            'payment_terms_days' => ['nullable', 'integer', 'min:0', 'max:365'],
        ]);

        return response()->json(
            Supplier::query()->create($data + ['code' => 'S-'.strtoupper(Str::random(8)), 'is_active' => true]),
            201,
        );
    }

    public function orders(Request $request): JsonResponse
    {
        return response()->json(
            PurchaseOrder::query()
                ->with(['supplier:id,name', 'warehouse:id,name'])
                ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
                ->when($request->query('supplier_id'), fn ($q, $v) => $q->where('supplier_id', $v))
                ->orderByDesc('ordered_on')
                ->paginate(min((int) $request->query('per_page', 25), 200))
        );
    }

    public function storeOrder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'expected_on' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'lines.*.product_unit_id' => ['required', 'integer', 'exists:product_units,id'],
            'lines.*.qty' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'lines.*.unit_cost' => ['required', 'string', 'regex:/^\d+(\.\d{1,6})?$/'],
        ]);

        $data['branch_id'] = $request->attributes->get('pos.branch_id');

        // Ordering does not move stock; only a receipt does.
        return response()->json($this->purchases->createOrder($data), 201);
    }

    public function showOrder(PurchaseOrder $purchaseOrder): JsonResponse
    {
        return response()->json($purchaseOrder->load(['lines.variant.product:id,name', 'supplier', 'warehouse', 'receipts']));
    }

    public function receive(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'purchase_order_id' => ['nullable', 'integer', 'exists:purchase_orders,id'],
            'supplier_reference' => ['nullable', 'string', 'max:80'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'lines.*.product_unit_id' => ['required', 'integer', 'exists:product_units,id'],
            'lines.*.qty' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'lines.*.unit_cost' => ['required', 'string', 'regex:/^\d+(\.\d{1,6})?$/'],
            'lines.*.purchase_order_line_id' => ['nullable', 'integer', 'exists:purchase_order_lines,id'],
            'lines.*.batch_code' => ['nullable', 'string', 'max:60'],
            'lines.*.expiry_date' => ['nullable', 'date'],
            'lines.*.serials' => ['nullable', 'array'],
            'lines.*.serials.*' => ['string', 'max:80'],
        ]);

        $data['branch_id'] = $request->attributes->get('pos.branch_id');
        $data['idempotency_key'] = $request->header('Idempotency-Key');

        return response()->json($this->purchases->receive($data), 201);
    }

    public function receipts(Request $request): JsonResponse
    {
        return response()->json(
            GoodsReceipt::query()
                ->with(['supplier:id,name', 'warehouse:id,name'])
                ->when($request->query('supplier_id'), fn ($q, $v) => $q->where('supplier_id', $v))
                ->orderByDesc('received_at')
                ->paginate(min((int) $request->query('per_page', 25), 200))
        );
    }
}
