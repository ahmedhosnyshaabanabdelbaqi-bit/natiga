<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Purchasing\GoodsReceiptService;
use App\Domain\Purchasing\SupplierInvoiceService;
use App\Models\GoodsReceipt;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PurchasingController extends ApiController
{
    public function __construct(
        private readonly GoodsReceiptService $receipts,
        private readonly SupplierInvoiceService $invoices,
    ) {}

    public function suppliers(Request $request): JsonResponse
    {
        $query = Supplier::query()
            ->where('company_id', $this->companyId($request))
            ->when($request->filled('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')));

        return $this->paginate($request, $query, ['name', 'code', 'phone'], ['name', 'code']);
    }

    public function supplierStatement(Request $request, int $id): JsonResponse
    {
        $supplier = Supplier::where('company_id', $this->companyId($request))->findOrFail($id);
        $from = $request->input('from', now()->startOfYear()->toDateString());
        $to = $request->input('to', now()->toDateString());

        $invoices = DB::table('supplier_invoices')
            ->where('supplier_id', $id)->where('status', '!=', 'cancelled')
            ->whereBetween('invoice_date', [$from, $to])
            ->select(DB::raw('invoice_date AS date'), DB::raw("'فاتورة مورد' AS doc_type"), 'invoice_no AS doc_no',
                DB::raw('0 AS debit'), DB::raw('total_amount AS credit'));

        $payments = DB::table('supplier_payments')
            ->where('supplier_id', $id)->where('status', 'posted')
            ->whereBetween('payment_date', [$from, $to])
            ->select(DB::raw('payment_date AS date'), DB::raw("'سند صرف' AS doc_type"), 'voucher_no AS doc_no',
                DB::raw('amount AS debit'), DB::raw('0 AS credit'));

        $returns = DB::table('purchase_returns')
            ->where('supplier_id', $id)->where('status', 'posted')
            ->whereBetween('return_date', [$from, $to])
            ->select(DB::raw('return_date AS date'), DB::raw("'مرتجع مشتريات' AS doc_type"), 'return_no AS doc_no',
                DB::raw('total_amount AS debit'), DB::raw('0 AS credit'));

        $lines = DB::query()->fromSub($invoices->unionAll($payments)->unionAll($returns), 't')
            ->orderBy('date')->get();

        $balance = '0';
        $lines = $lines->map(function ($row) use (&$balance) {
            $balance = \App\Support\Dec::money(\App\Support\Dec::add($balance, \App\Support\Dec::sub($row->credit, $row->debit)));
            $row->running_balance = $balance;

            return $row;
        });

        return $this->ok([
            'supplier' => ['id' => $supplier->id, 'code' => $supplier->code, 'name' => $supplier->name],
            'period' => ['from' => $from, 'to' => $to],
            'lines' => $lines,
            'closing_balance' => $balance,
        ]);
    }

    public function receiptsIndex(Request $request): JsonResponse
    {
        $query = GoodsReceipt::query()
            ->where('company_id', $this->companyId($request))
            ->with(['supplier:id,name', 'warehouse:id,name'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->when($request->boolean('uninvoiced_only'), fn ($q) => $q->where('is_invoiced', false))
            ->orderByDesc('receipt_date')->orderByDesc('id');

        return $this->paginate($request, $query, ['receipt_no', 'supplier_delivery_no'], ['receipt_date', 'receipt_no'], ['total_cost']);
    }

    public function storeReceipt(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'receipt_date' => ['required', 'date'],
            'purchase_order_id' => ['nullable', 'integer', 'exists:purchase_orders,id'],
            'supplier_delivery_no' => ['nullable', 'string', 'max:60'],
            'notes' => ['nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'lines.*.uom_id' => ['required', 'integer', 'exists:uoms,id'],
            'lines.*.qty_uom' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
            'lines.*.batch_no' => ['nullable', 'string', 'max:60'],
            'lines.*.expiry_date' => ['nullable', 'date'],
            'lines.*.status_bucket' => ['nullable', 'in:available,inspection,quarantine'],
            'lines.*.purchase_order_line_id' => ['nullable', 'integer'],
        ]);

        $data['company_id'] = $this->companyId($request);
        $data['branch_id'] = $request->user()->branch_id;
        $data['user_id'] = $request->user()->id;

        return $this->ok($this->receipts->createAndPost($data)->load('lines'), status: 201);
    }

    public function invoicesIndex(Request $request): JsonResponse
    {
        $query = SupplierInvoice::query()
            ->where('company_id', $this->companyId($request))
            ->with('supplier:id,name')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->orderByDesc('invoice_date')->orderByDesc('id');

        return $this->paginate($request, $query, ['invoice_no', 'supplier_invoice_no'], ['invoice_date', 'total_amount'], ['total_amount', 'paid_amount']);
    }

    public function storeInvoice(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'invoice_date' => ['required', 'date'],
            'due_date' => ['nullable', 'date'],
            'supplier_invoice_no' => ['nullable', 'string', 'max:60'],
            'payment_type' => ['nullable', 'in:cash,credit'],
            'payment_term_days' => ['nullable', 'integer', 'min:0'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'lines.*.uom_id' => ['required', 'integer', 'exists:uoms,id'],
            'lines.*.qty_uom' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
            'lines.*.goods_receipt_line_id' => ['nullable', 'integer', 'exists:goods_receipt_lines,id'],
            'lines.*.tax_rate' => ['nullable', 'numeric', 'min:0'],
        ]);

        $data['company_id'] = $this->companyId($request);
        $data['branch_id'] = $request->user()->branch_id;
        $data['user_id'] = $request->user()->id;

        return $this->ok($this->invoices->createAndPost($data)->load('lines'), status: 201);
    }
}
