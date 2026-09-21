<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Credit\CreditService;
use App\Domain\Sales\SalesOrderService;
use App\Models\Customer;
use App\Models\SalesOrder;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SalesOrderController extends ApiController
{
    public function __construct(
        private readonly SalesOrderService $service,
        private readonly CreditService $credit,
    ) {}

    /**
     * نطاق المندوب داخل الاستعلام نفسه — الوصول بمعرّف أمر عميل آخر يعيد 404 لا 403،
     * حتى لا يكشف الرد وجود السجل من عدمه.
     */
    private function scoped(Request $request): Builder
    {
        $user = $request->user();

        $query = SalesOrder::query()->where('company_id', $this->companyId($request));

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
            ->with(['customer:id,code,name', 'salesman:id,name', 'warehouse:id,name'])
            ->when($request->filled('customer_id'), fn ($q) => $q->where('customer_id', $request->input('customer_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->when($request->filled('delivery_status'), fn ($q) => $q->where('delivery_status', $request->input('delivery_status')))
            ->when($request->filled('invoice_status'), fn ($q) => $q->where('invoice_status', $request->input('invoice_status')))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('order_date', '>=', $request->input('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('order_date', '<=', $request->input('to')))
            // الأوامر التي ما زال فيها ما يُسلَّم — شاشة عمل أمين المخزن
            ->when($request->boolean('open_only'), fn ($q) => $q->where('status', 'approved')->whereIn('delivery_status', ['pending', 'partial']))
            ->orderByDesc('order_date')
            ->orderByDesc('id');

        return $this->paginate(
            $request,
            $query,
            searchable: ['order_no', 'customer_po_no'],
            sortable: ['order_date', 'order_no', 'total_amount'],
            sumColumns: ['total_amount'],
        );
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $order = $this->scoped($request)
            ->with([
                'lines.item:id,code,name_ar',
                'lines.uom:id,code,name_ar',
                'customer',
                'salesman:id,name',
                'warehouse:id,name',
                'deliveryNotes:id,sales_order_id,delivery_no,delivery_date,status',
                'invoices:id,sales_order_id,invoice_no,invoice_date,status,total_amount',
            ])
            ->findOrFail($id);

        return $this->ok($order->toArray());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request);

        $data['company_id'] = $this->companyId($request);
        $data['branch_id'] = $request->user()->branch_id;
        $data['user_id'] = $request->user()->id;

        $this->assertCustomerInScope($request, (int) $data['customer_id']);

        $approve = (bool) ($data['approve'] ?? false);
        unset($data['approve']);

        $order = $this->service->create($data);

        if ($approve) {
            abort_unless($request->user()->hasPermission('sales_order.approve'), 403, 'لا تملك صلاحية اعتماد أوامر البيع.');
            $order = $this->service->approve($order, (int) $request->user()->id);
        }

        return $this->ok($order->load('lines'), status: 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $order = $this->scoped($request)->findOrFail($id);
        $data = $this->validatePayload($request, required: false);

        return $this->ok($this->service->update($order, $data)->load('lines'));
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'credit_override' => ['nullable', 'boolean'],
            'credit_override_reason' => ['nullable', 'string', 'min:3'],
        ]);

        $override = (bool) ($data['credit_override'] ?? false);

        // تجاوز الائتمان صلاحية مستقلة عن اعتماد الأمر
        if ($override) {
            abort_unless(
                $request->user()->hasPermission('customer.override_credit'),
                403,
                'لا تملك صلاحية تجاوز الحد الائتماني.',
            );
        }

        $order = $this->scoped($request)->findOrFail($id);

        $approved = $this->service->approve(
            $order,
            (int) $request->user()->id,
            $override,
            $data['credit_override_reason'] ?? null,
        );

        return $this->ok($approved->load('lines')->toArray() + [
            'shortages' => $approved->getAttribute('shortages') ?: [],
        ]);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3']]);
        $order = $this->scoped($request)->findOrFail($id);

        return $this->ok($this->service->cancel($order, $data['reason'], (int) $request->user()->id));
    }

    public function close(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string']]);
        $order = $this->scoped($request)->findOrFail($id);

        return $this->ok($this->service->close($order, (int) $request->user()->id, $data['reason'] ?? null));
    }

    /** التعرض الائتماني للعميل قبل كتابة الأمر — يمنع مفاجأة الرفض عند الاعتماد. */
    public function creditCheck(Request $request): JsonResponse
    {
        $data = $request->validate(['customer_id' => ['required', 'integer', 'exists:customers,id']]);

        $this->assertCustomerInScope($request, (int) $data['customer_id']);

        return $this->ok($this->credit->exposure($this->companyId($request), (int) $data['customer_id']));
    }

    private function validatePayload(Request $request, bool $required = true): array
    {
        $req = $required ? 'required' : 'sometimes';

        return $request->validate([
            'customer_id' => [$req, 'integer', 'exists:customers,id'],
            'warehouse_id' => [$req, 'integer', 'exists:warehouses,id'],
            'order_date' => ['nullable', 'date'],
            'required_date' => ['nullable', 'date'],
            'customer_address_id' => ['nullable', 'integer', 'exists:customer_addresses,id'],
            'salesman_id' => ['nullable', 'integer', 'exists:salesmen,id'],
            'price_list_id' => ['nullable', 'integer', 'exists:price_lists,id'],
            'customer_po_no' => ['nullable', 'string', 'max:60'],
            'channel' => ['nullable', 'in:presale,van_sale,counter,b2b_portal'],
            'payment_type' => ['nullable', 'in:cash,credit,mixed'],
            'payment_term_days' => ['nullable', 'integer', 'min:0'],
            'is_backorder_allowed' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string'],
            'approve' => ['nullable', 'boolean'],
            'lines' => [$req, 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'lines.*.uom_id' => ['required', 'integer', 'exists:uoms,id'],
            'lines.*.qty_uom' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['required_without:lines.*.is_free', 'numeric', 'min:0'],
            'lines.*.discount_pct' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'lines.*.tax_rate' => ['nullable', 'numeric', 'min:0'],
            'lines.*.is_free' => ['nullable', 'boolean'],
            'lines.*.notes' => ['nullable', 'string'],
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

        $owned = Customer::where('company_id', $this->companyId($request))
            ->where('id', $customerId)
            ->where('salesman_id', $salesmanId)
            ->exists();

        abort_unless($owned, 403, 'هذا العميل غير مسند إليك.');
    }
}
