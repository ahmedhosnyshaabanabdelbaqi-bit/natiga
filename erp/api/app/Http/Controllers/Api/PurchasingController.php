<?php

namespace App\Http\Controllers\Api;

use App\Domain\Purchasing\GoodsReceiptService;
use App\Domain\Purchasing\LandedCostService;
use App\Domain\Purchasing\ReorderService;
use App\Domain\Purchasing\SupplierInvoiceService;
use App\Domain\Support\DocumentNumbering;
use App\Domain\Support\Num;
use App\Models\GoodsReceipt;
use App\Models\Item;
use App\Models\ItemUnit;
use App\Models\LandedCost;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderLine;
use App\Models\SupplierInvoice;
use App\Support\CompanyContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PurchasingController extends BaseApiController
{
    protected array $sortable = ['code', 'order_date', 'total'];

    protected array $searchable = ['purchase_orders.code'];

    public function __construct(
        private readonly GoodsReceiptService $receipts,
        private readonly SupplierInvoiceService $supplierInvoices,
        private readonly LandedCostService $landedCosts,
        private readonly ReorderService $reorder,
        private readonly DocumentNumbering $numbering,
    ) {}

    // -------------------------------------------------------- purchase orders

    public function orders(Request $request): JsonResponse
    {
        $query = PurchaseOrder::query()
            ->with(['supplier:id,code,name', 'warehouse:id,name'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('supplier_id'), fn ($q) => $q->where('supplier_id', $request->integer('supplier_id')));

        return $this->paginated($query, $request, fn (PurchaseOrder $o) => [
            'id' => $o->id,
            'code' => $o->code,
            'order_date' => $o->order_date->toDateString(),
            'expected_date' => $o->expected_date?->toDateString(),
            'supplier' => $o->supplier?->name,
            'warehouse' => $o->warehouse?->name,
            'status' => $o->status,
            'total' => (string) $o->total,
        ]);
    }

    public function storeOrder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'header.supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'header.warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'header.branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'header.order_date' => ['nullable', 'date'],
            'header.expected_date' => ['nullable', 'date'],
            'header.notes' => ['nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'lines.*.item_unit_id' => ['nullable', 'integer', 'exists:item_units,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
            'lines.*.discount_pct' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        $order = DB::transaction(function () use ($data, $request) {
            $order = PurchaseOrder::create(array_merge($data['header'], [
                'company_id' => CompanyContext::idOrFail(),
                'code' => $this->numbering->next('purchase_order', $data['header']['branch_id'] ?? null),
                'order_date' => $data['header']['order_date'] ?? now()->toDateString(),
                'status' => 'draft',
                'created_by' => $request->user()->id,
            ]));

            $subtotal = '0';
            $tax = '0';

            foreach ($data['lines'] as $input) {
                $item = Item::findOrFail($input['item_id']);
                $itemUnit = isset($input['item_unit_id'])
                    ? ItemUnit::findOrFail($input['item_unit_id'])
                    : ItemUnit::where('item_id', $item->id)->orderByDesc('is_purchase_default')
                        ->orderByDesc('is_base')->firstOrFail();

                $qtyInput = Num::qty($input['qty']);
                $gross = Num::mul($qtyInput, $input['unit_price']);
                $discount = Num::pct($gross, $input['discount_pct'] ?? '0');
                $net = Num::sub($gross, $discount);
                $taxRate = $item->is_taxable ? Num::of($item->taxRate?->rate ?? '0') : '0';
                $lineTax = Num::pct($net, $taxRate);

                PurchaseOrderLine::create([
                    'purchase_order_id' => $order->id,
                    'item_id' => $item->id,
                    'item_unit_id' => $itemUnit->id,
                    'unit_factor' => $itemUnit->factor,
                    'qty_input' => $qtyInput,
                    'qty_base' => Num::qty($itemUnit->toBase($qtyInput)),
                    'unit_price' => Num::round($input['unit_price'], 4),
                    'discount_pct' => Num::of($input['discount_pct'] ?? '0'),
                    'tax_rate' => $taxRate,
                    'tax_amount' => Num::money($lineTax),
                    'line_total' => Num::money(Num::add($net, $lineTax, Num::MONEY_SCALE)),
                ]);

                $subtotal = Num::add($subtotal, $net, Num::MONEY_SCALE);
                $tax = Num::add($tax, $lineTax, Num::MONEY_SCALE);
            }

            $order->forceFill([
                'subtotal' => Num::money($subtotal),
                'tax_amount' => Num::money($tax),
                'total' => Num::money(Num::add($subtotal, $tax, Num::MONEY_SCALE)),
            ])->save();

            return $order;
        });

        return response()->json(['order' => $order->load('lines')], 201);
    }

    public function approveOrder(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        if ($purchaseOrder->status !== 'draft' && $purchaseOrder->status !== 'pending_approval') {
            return response()->json([
                'error' => 'purchasing.order_not_approvable',
                'message' => 'أمر الشراء غير قابل للاعتماد في حالته الحالية.',
            ], 422);
        }

        $purchaseOrder->forceFill([
            'status' => 'approved',
            'approved_by' => $request->user()->id,
        ])->save();

        return response()->json(['order' => $purchaseOrder]);
    }

    // --------------------------------------------------------- goods receipts

    public function storeReceipt(Request $request): JsonResponse
    {
        $data = $request->validate([
            'header.supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'header.purchase_order_id' => ['nullable', 'integer', 'exists:purchase_orders,id'],
            'header.warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'header.receipt_date' => ['nullable', 'date'],
            'header.supplier_delivery_ref' => ['nullable', 'string', 'max:64'],
            'header.notes' => ['nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['nullable', 'integer', 'exists:items,id'],
            'lines.*.purchase_order_line_id' => ['nullable', 'integer', 'exists:purchase_order_lines,id'],
            'lines.*.item_unit_id' => ['nullable', 'integer', 'exists:item_units,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_cost' => ['nullable', 'numeric', 'min:0'],
            'lines.*.batch_code' => ['nullable', 'string', 'max:64'],
            'lines.*.expiry_date' => ['nullable', 'date'],
            'lines.*.mfg_date' => ['nullable', 'date'],
            'lines.*.disposition' => ['nullable', 'in:stock,inspection,quarantine'],
            'post' => ['nullable', 'boolean'],
        ]);

        $receipt = $this->receipts->create($data['header'], $data['lines']);

        if ($data['post'] ?? false) {
            $receipt = $this->receipts->post($receipt);
        }

        return response()->json(['receipt' => $receipt->load('lines')], 201);
    }

    public function postReceipt(GoodsReceipt $goodsReceipt): JsonResponse
    {
        return response()->json(['receipt' => $this->receipts->post($goodsReceipt)->load('lines')]);
    }

    // ------------------------------------------------------ supplier invoices

    public function storeSupplierInvoice(Request $request): JsonResponse
    {
        $data = $request->validate([
            'header.supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'header.supplier_invoice_no' => ['nullable', 'string', 'max:64'],
            'header.invoice_date' => ['nullable', 'date'],
            'header.due_date' => ['nullable', 'date'],
            'header.discount_amount' => ['nullable', 'numeric', 'min:0'],
            'header.notes' => ['nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.goods_receipt_line_id' => ['nullable', 'integer', 'exists:goods_receipt_lines,id'],
            'lines.*.item_id' => ['nullable', 'integer', 'exists:items,id'],
            'lines.*.expense_account_id' => ['nullable', 'integer', 'exists:accounts,id'],
            'lines.*.qty_base' => ['nullable', 'numeric', 'min:0'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
            'lines.*.tax_rate' => ['nullable', 'numeric', 'min:0'],
            'post' => ['nullable', 'boolean'],
        ]);

        $invoice = $this->supplierInvoices->create($data['header'], $data['lines']);

        if ($data['post'] ?? false) {
            $invoice = $this->supplierInvoices->post($invoice);
        }

        return response()->json(['invoice' => $invoice->load('lines')], 201);
    }

    public function postSupplierInvoice(SupplierInvoice $supplierInvoice): JsonResponse
    {
        return response()->json([
            'invoice' => $this->supplierInvoices->post($supplierInvoice)->load('lines'),
        ]);
    }

    /** Received-but-unbilled — should reconcile to the GRNI control account. */
    public function grni(Request $request): JsonResponse
    {
        return response()->json([
            'rows' => $this->supplierInvoices->grniBalance($request->integer('supplier_id') ?: null),
        ]);
    }

    // ------------------------------------------------------------ landed cost

    public function storeLandedCost(Request $request): JsonResponse
    {
        $data = $request->validate([
            'header.cost_date' => ['nullable', 'date'],
            'header.kind' => ['required', 'string', 'max:32'],
            'header.supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'header.amount' => ['required', 'numeric', 'gt:0'],
            'header.allocation_method' => ['nullable', 'in:value,qty,weight'],
            'header.notes' => ['nullable', 'string'],
            'goods_receipt_ids' => ['required', 'array', 'min:1'],
            'goods_receipt_ids.*' => ['integer', 'exists:goods_receipts,id'],
            'post' => ['nullable', 'boolean'],
        ]);

        $cost = $this->landedCosts->create($data['header'], $data['goods_receipt_ids']);

        if ($data['post'] ?? false) {
            $cost = $this->landedCosts->post($cost);
        }

        return response()->json(['landed_cost' => $cost->load('allocations')], 201);
    }

    public function postLandedCost(LandedCost $landedCost): JsonResponse
    {
        return response()->json([
            'landed_cost' => $this->landedCosts->post($landedCost)->load('allocations'),
        ]);
    }

    // -------------------------------------------------------------- reordering

    public function reorderSuggestions(Request $request): JsonResponse
    {
        return response()->json([
            'suggestions' => $this->reorder->suggestions(
                $request->integer('warehouse_id') ?: null,
                $request->integer('lookback_days') ?: 90
            ),
        ]);
    }
}
