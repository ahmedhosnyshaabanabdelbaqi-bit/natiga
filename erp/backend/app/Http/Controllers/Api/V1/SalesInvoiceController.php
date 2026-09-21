<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Sales\SalesInvoiceService;
use App\Models\SalesInvoice;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SalesInvoiceController extends ApiController
{
    public function __construct(private readonly SalesInvoiceService $service) {}

    private function scoped(Request $request): Builder
    {
        $user = $request->user();

        $query = SalesInvoice::query()->where('company_id', $this->companyId($request));

        if (! $user->hasPermission('customer.view_all')) {
            $salesmanId = $user->salesmanId();
            if ($salesmanId !== null) {
                $query->where('salesman_id', $salesmanId);
            }
        }

        return $query;
    }

    public function index(Request $request): JsonResponse
    {
        $query = $this->scoped($request)
            ->with(['customer:id,code,name', 'salesman:id,name'])
            ->when($request->filled('customer_id'), fn ($q) => $q->where('customer_id', $request->input('customer_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('invoice_date', '>=', $request->input('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('invoice_date', '<=', $request->input('to')))
            ->when($request->boolean('unpaid_only'), fn ($q) => $q->whereRaw('total_amount - paid_amount - returned_amount > 0'))
            ->orderByDesc('invoice_date')
            ->orderByDesc('id');

        $response = $this->paginate(
            $request,
            $query,
            searchable: ['invoice_no', 'field_no'],
            sortable: ['invoice_date', 'invoice_no', 'total_amount'],
            sumColumns: ['total_amount', 'paid_amount', 'returned_amount'],
        );

        return $this->stripCost($request, $response);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $invoice = $this->scoped($request)
            ->with(['lines.item:id,code,name_ar', 'lines.uom:id,code,name_ar', 'customer', 'salesman:id,name', 'warehouse:id,name'])
            ->findOrFail($id);

        $payload = $invoice->toArray();

        if (! $request->user()->canSeeCost()) {
            unset($payload['total_cost']);
            foreach ($payload['lines'] as &$line) {
                unset($line['unit_cost'], $line['total_cost']);
            }
        }

        return $this->ok($payload);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'invoice_date' => ['required', 'date'],
            'due_date' => ['nullable', 'date'],
            'salesman_id' => ['nullable', 'integer', 'exists:salesmen,id'],
            'sales_order_id' => ['nullable', 'integer', 'exists:sales_orders,id'],
            'delivery_note_id' => ['nullable', 'integer', 'exists:delivery_notes,id'],
            'payment_type' => ['required', 'in:cash,credit,mixed'],
            'channel' => ['nullable', 'in:presale,van_sale,counter,b2b_portal'],
            'delivery_fee' => ['nullable', 'numeric', 'min:0'],
            'header_discount_amount' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
            'post' => ['nullable', 'boolean'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'lines.*.uom_id' => ['required', 'integer', 'exists:uoms,id'],
            'lines.*.qty_uom' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['required_without:lines.*.is_free', 'numeric', 'min:0'],
            'lines.*.discount_pct' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'lines.*.tax_rate' => ['nullable', 'numeric', 'min:0'],
            'lines.*.batch_id' => ['nullable', 'integer', 'exists:stock_batches,id'],
            'lines.*.is_free' => ['nullable', 'boolean'],
        ]);

        $data['company_id'] = $this->companyId($request);
        $data['branch_id'] = $request->user()->branch_id;
        $data['user_id'] = $request->user()->id;

        // المندوب لا يصدر فاتورة لعميل غير مسند إليه
        $this->assertCustomerInScope($request, (int) $data['customer_id']);

        $shouldPost = $data['post'] ?? true;
        unset($data['post']);

        if ($shouldPost) {
            abort_unless($request->user()->hasPermission('sales_invoice.post'), 403, 'لا تملك صلاحية ترحيل الفواتير.');
            $invoice = $this->service->createAndPost($data);
        } else {
            $invoice = $this->service->create($data);
        }

        return $this->ok($invoice->load('lines'), status: 201);
    }

    public function post(Request $request, int $id): JsonResponse
    {
        $invoice = $this->scoped($request)->findOrFail($id);

        return $this->ok($this->service->post($invoice, (int) $request->user()->id));
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3']]);

        $invoice = $this->scoped($request)->findOrFail($id);

        return $this->ok($this->service->cancel($invoice, $data['reason'], (int) $request->user()->id));
    }

    /** إعادة طباعة موسومة ومعدودة. */
    public function reprint(Request $request, int $id): JsonResponse
    {
        $invoice = $this->scoped($request)->with(['lines.item:id,code,name_ar', 'lines.uom:id,name_ar', 'customer'])->findOrFail($id);

        $invoice->increment('print_count');

        return $this->ok([
            'invoice' => $invoice->fresh('lines'),
            'is_reprint' => $invoice->print_count > 1,
            'print_count' => $invoice->print_count,
            'watermark' => $invoice->print_count > 1 ? 'نسخة معادة الطباعة' : null,
        ]);
    }

    private function assertCustomerInScope(Request $request, int $customerId): void
    {
        $user = $request->user();

        if ($user->hasPermission('customer.view_all')) {
            return;
        }

        $salesmanId = $user->salesmanId();

        if ($salesmanId === null) {
            return;
        }

        $owned = \App\Models\Customer::where('company_id', $this->companyId($request))
            ->where('id', $customerId)
            ->where('salesman_id', $salesmanId)
            ->exists();

        abort_unless($owned, 403, 'هذا العميل غير مسند إليك.');
    }

    private function stripCost(Request $request, JsonResponse $response): JsonResponse
    {
        if ($request->user()->canSeeCost()) {
            return $response;
        }

        $payload = $response->getData(true);

        foreach ($payload['data'] as &$row) {
            unset($row['total_cost']);
        }

        return response()->json($payload);
    }
}
