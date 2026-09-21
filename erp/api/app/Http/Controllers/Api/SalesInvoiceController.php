<?php

namespace App\Http\Controllers\Api;

use App\Domain\Sales\InvoiceService;
use App\Models\DeliveryNote;
use App\Models\SalesInvoice;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SalesInvoiceController extends BaseApiController
{
    protected array $sortable = ['code', 'invoice_date', 'due_date', 'total', 'created_at'];

    protected array $searchable = ['sales_invoices.code', 'sales_invoices.field_no'];

    public function __construct(private readonly InvoiceService $invoices) {}

    public function index(Request $request): JsonResponse
    {
        $canSeeCost = $request->user()->hasPermission('inventory.cost.view');

        $query = $this->scopedQuery($request)
            ->with(['customer:id,code,name', 'rep:id,name'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('payment_status'), fn ($q) => $q->where('payment_status', $request->string('payment_status')))
            ->when($request->filled('customer_id'), fn ($q) => $q->where('customer_id', $request->integer('customer_id')))
            ->when($request->filled('from'), fn ($q) => $q->where('invoice_date', '>=', $request->string('from')))
            ->when($request->filled('to'), fn ($q) => $q->where('invoice_date', '<=', $request->string('to')))
            ->when($request->boolean('overdue'), fn ($q) => $q
                ->where('status', 'posted')
                ->whereIn('payment_status', ['unpaid', 'partial'])
                ->whereDate('due_date', '<', now()));

        return $this->paginated($query, $request, function (SalesInvoice $i) use ($canSeeCost) {
            $row = [
                'id' => $i->id,
                'code' => $i->code,
                'invoice_date' => $i->invoice_date->toDateString(),
                'due_date' => $i->due_date?->toDateString(),
                'customer' => $i->customer?->name,
                'rep' => $i->rep?->name,
                'payment_type' => $i->payment_type,
                'status' => $i->status,
                'payment_status' => $i->payment_status,
                'total' => (string) $i->total,
                'paid_amount' => (string) $i->paid_amount,
                'outstanding' => $i->outstandingAmount(),
                'e_invoice_status' => $i->e_invoice_status,
            ];

            // Cost and margin are stripped from the payload itself, not merely
            // hidden in the UI, for users without the permission.
            if ($canSeeCost) {
                $row['cogs_amount'] = (string) $i->cogs_amount;
                $row['gross_profit'] = $i->grossProfit();
            }

            return $row;
        });
    }

    public function show(Request $request, SalesInvoice $salesInvoice): JsonResponse
    {
        $this->authorizeReach($request, $salesInvoice);

        $salesInvoice->load(['lines.item:id,code,name', 'lines.batch:id,code,expiry_date',
            'customer', 'rep:id,name', 'deliveryNote:id,code', 'order:id,code',
            'allocations.receipt:id,code,receipt_date,amount']);

        $canSeeCost = $request->user()->hasPermission('inventory.cost.view');
        $payload = $salesInvoice->toArray();

        if (! $canSeeCost) {
            unset($payload['cogs_amount']);
            $payload['lines'] = collect($payload['lines'])
                ->map(fn ($l) => collect($l)->except(['unit_cost', 'cogs_amount'])->all())
                ->all();
        }

        return response()->json(['invoice' => $payload]);
    }

    /** Invoice a confirmed delivery. */
    public function fromDelivery(Request $request, DeliveryNote $deliveryNote): JsonResponse
    {
        $data = $request->validate([
            'invoice_date' => ['nullable', 'date'],
            'due_date' => ['nullable', 'date'],
            'payment_type' => ['nullable', 'in:cash,credit,mixed'],
            'post' => ['nullable', 'boolean'],
        ]);

        $invoice = $this->invoices->createFromDelivery($deliveryNote, $data);

        if ($data['post'] ?? false) {
            $invoice = $this->invoices->post($invoice);
        }

        return response()->json(['invoice' => $invoice->load('lines')], 201);
    }

    /** Direct sale — used by counter sales and by the van-sale flow. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'header.customer_id' => ['required', 'integer', 'exists:customers,id'],
            'header.warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'header.branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'header.rep_id' => ['nullable', 'integer', 'exists:users,id'],
            'header.invoice_date' => ['nullable', 'date'],
            'header.due_date' => ['nullable', 'date'],
            'header.payment_type' => ['nullable', 'in:cash,credit,mixed'],
            'header.doc_discount_amount' => ['nullable', 'numeric', 'min:0'],
            'header.delivery_fee' => ['nullable', 'numeric', 'min:0'],
            'header.cost_center_id' => ['nullable', 'integer'],
            'header.notes' => ['nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'lines.*.item_unit_id' => ['nullable', 'integer', 'exists:item_units,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'lines.*.discount_pct' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'lines.*.batch_id' => ['nullable', 'integer'],
            'lines.*.is_bonus' => ['nullable', 'boolean'],
            'post' => ['nullable', 'boolean'],
        ]);

        foreach ($data['lines'] as $line) {
            if (isset($line['unit_price']) && ! $request->user()->hasPermission('sales.price.override')) {
                abort(403, 'لا تملك صلاحية تعديل السعر يدويًا.');
            }
        }

        $invoice = $this->invoices->createDirect($data['header'], $data['lines']);

        if ($data['post'] ?? false) {
            $invoice = $this->invoices->post($invoice);
        }

        return response()->json(['invoice' => $invoice->load('lines')], 201);
    }

    public function post(Request $request, SalesInvoice $salesInvoice): JsonResponse
    {
        $override = $request->boolean('credit_override')
            && $request->user()->hasPermission('sales.credit.override');

        return response()->json([
            'invoice' => $this->invoices->post($salesInvoice, $override)->load('lines'),
        ]);
    }

    public function cancel(Request $request, SalesInvoice $salesInvoice): JsonResponse
    {
        $reason = $request->validate(['reason' => ['required', 'string', 'max:500']])['reason'];

        return response()->json(['invoice' => $this->invoices->cancel($salesInvoice, $reason)]);
    }

    protected function scopedQuery(Request $request): Builder
    {
        $user = $request->user();
        $query = SalesInvoice::query();

        if (! $user->hasPermission('sales.invoice.view.all')) {
            $query->where('rep_id', $user->id);
        }

        if ($branches = $user->scopeIds('branch')) {
            $query->whereIn('branch_id', $branches);
        }

        return $query;
    }

    protected function authorizeReach(Request $request, SalesInvoice $invoice): void
    {
        $user = $request->user();

        if ($user->hasPermission('sales.invoice.view.all')) {
            return;
        }

        if ($invoice->rep_id !== $user->id) {
            abort(403, 'لا تملك صلاحية الوصول إلى هذه الفاتورة.');
        }
    }
}
