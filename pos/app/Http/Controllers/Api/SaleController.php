<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Modules\Access\Services\PermissionService;
use App\Modules\Printing\Services\PrintService;
use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Models\Sale;
use App\Modules\Sales\Services\SaleService;
use App\Modules\Sales\Services\SaleTotalsCalculator;
use App\Modules\Sync\Services\IdempotencyService;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class SaleController extends Controller
{
    public function __construct(
        private readonly SaleService $sales,
        private readonly SaleTotalsCalculator $calculator,
        private readonly IdempotencyService $idempotency,
        private readonly PrintService $printing,
        private readonly PermissionService $permissions,
    ) {}

    /** Preview totals without creating anything (server-authoritative maths). */
    public function quote(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.qty' => ['required', 'string'],
            'lines.*.unit_price' => ['required', 'string'],
            'lines.*.discount_amount' => ['nullable', 'string'],
            'lines.*.discount_percent' => ['nullable', 'string'],
            'lines.*.tax_rate' => ['nullable', 'string'],
            'lines.*.tax_inclusive' => ['nullable', 'boolean'],
            'invoice_discount_type' => ['nullable', 'in:amount,percent'],
            'invoice_discount_value' => ['nullable', 'string'],
        ]);

        $totals = $this->calculator->calculate(
            $data['lines'],
            ['type' => $data['invoice_discount_type'] ?? null, 'value' => $data['invoice_discount_value'] ?? null],
        );

        return response()->json($totals->toArray());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lines' => ['required', 'array', 'min:1', 'max:500'],
            'lines.*.variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'lines.*.product_unit_id' => ['nullable', 'integer', 'exists:product_units,id'],
            'lines.*.qty' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'lines.*.unit_price' => ['nullable', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'lines.*.discount_amount' => ['nullable', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'lines.*.discount_percent' => ['nullable', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'lines.*.batch_id' => ['nullable', 'integer', 'exists:batches,id'],
            'lines.*.serials' => ['nullable', 'array'],
            'lines.*.serials.*' => ['string', 'max:80'],
            'payments' => ['array'],
            'payments.*.payment_method_id' => ['required', 'integer', 'exists:payment_methods,id'],
            'payments.*.amount' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'payments.*.tendered_amount' => ['nullable', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'payments.*.reference' => ['nullable', 'string', 'max:120'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'price_list_id' => ['nullable', 'integer', 'exists:price_lists,id'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'invoice_discount_type' => ['nullable', 'in:amount,percent'],
            'invoice_discount_value' => ['nullable', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'is_credit' => ['boolean'],
            'due_date' => ['nullable', 'date'],
            'approval_uuid' => ['nullable', 'uuid'],
            'held_cart_id' => ['nullable', 'integer', 'exists:held_carts,id'],
            'quote_id' => ['nullable', 'integer', 'exists:quotes,id'],
            'expected_grand_total' => ['nullable', 'string'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        // The idempotency key travels in a header, as HTTP convention expects.
        $data['idempotency_key'] = $request->header('Idempotency-Key') ?: ($data['idempotency_key'] ?? null);

        $result = $this->sales->checkout(SaleRequest::fromArray($data));

        return response()->json(
            $result['response'] + ['replayed' => $result['replayed']],
            $result['replayed'] ? 200 : 201,
        );
    }

    /**
     * Recover the outcome of a submitted sale by its idempotency key.
     * This is what a terminal calls when the response was lost — instead of
     * sending the sale again.
     */
    public function lookup(Request $request, string $key): JsonResponse
    {
        $record = $this->idempotency->lookup('sale', $key);

        if (! $record) {
            return response()->json(['message' => 'لا توجد عملية بهذا المفتاح.', 'error_code' => 'idempotency_key_unknown'], 404);
        }

        return response()->json($record);
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $branchId = $request->attributes->get('pos.branch_id');

        $query = Sale::query()
            ->with(['customer:id,name', 'cashier:id,name'])
            ->when(! $this->permissions->userCan($user, 'sales.view_all', $branchId),
                fn ($q) => $q->where('user_id', $user->id))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->when($request->query('number'), fn ($q, $v) => $q->where('number', 'ILIKE', '%'.$v.'%'))
            ->when($request->query('customer_id'), fn ($q, $v) => $q->where('customer_id', $v))
            ->when($request->query('user_id'), fn ($q, $v) => $q->where('user_id', $v))
            ->when($request->query('from'), fn ($q, $v) => $q->where('business_date', '>=', $v))
            ->when($request->query('to'), fn ($q, $v) => $q->where('business_date', '<=', $v))
            ->when($request->query('payment_method'), fn ($q, $v) => $q->whereHas('payments', fn ($p) => $p->where('method_code', $v)))
            ->when($request->query('barcode'), fn ($q, $v) => $q->whereHas('lines', fn ($l) => $l->where('barcode', $v)))
            ->orderByDesc('sold_at');

        $perPage = min((int) $request->query('per_page', 25), (int) config('pos.performance.max_page_size', 200));

        return response()->json($query->paginate($perPage));
    }

    public function show(Request $request, Sale $sale): JsonResponse
    {
        $user = $request->user();

        if (! $this->permissions->userCan($user, 'sales.view_all', $sale->branch_id) && $sale->user_id !== $user->id) {
            return response()->json(['message' => 'غير مصرح بعرض هذه الفاتورة.', 'error_code' => 'permission_denied'], 403);
        }

        $payload = $this->sales->present($sale);

        // Cost and margin are stripped unless the user is allowed to see them —
        // hiding the column in the UI is not enough.
        if ($this->permissions->userCan($user, 'sales.view_cost', $sale->branch_id)) {
            $payload['cost_total'] = $sale->cost_total;
            $payload['profit_total'] = $sale->profit_total;
        }

        return response()->json($payload);
    }

    public function reprint(Request $request, Sale $sale): JsonResponse
    {
        $job = $this->printing->queueReceipt($sale, $request->input('paper'), isReprint: true);

        return response()->json([
            'print_job' => $job->uuid,
            'copy_number' => $sale->fresh()->print_count,
            'payload' => $job->payload,
        ], 201);
    }

    /** Lines of an invoice with how much of each is still returnable. */
    public function returnable(Sale $sale): JsonResponse
    {
        $sale->loadMissing('lines.serials');

        return response()->json([
            'sale' => ['id' => $sale->id, 'number' => $sale->number, 'is_credit' => $sale->is_credit],
            'lines' => $sale->lines->map(fn ($line) => [
                'sale_line_id' => $line->id,
                'product_name' => $line->product_name,
                'unit_name' => $line->unit_name,
                'unit_factor' => $line->unit_factor,
                'qty_sold' => $line->qty,
                'qty_sold_base' => $line->qty_base,
                'qty_returned_base' => $line->returned_qty_base,
                'qty_returnable_base' => $line->returnableQtyBase()->toString(),
                'unit_price' => $line->unit_price,
                'effective_unit_total' => $line->effectiveUnitTotal()->toString(),
                'serials' => $line->serials->where('returned', false)->pluck('serial')->values()->all(),
            ])->all(),
            'outstanding' => $sale->is_credit ? $sale->outstanding()->toString() : Money::zero()->toString(),
        ]);
    }
}
