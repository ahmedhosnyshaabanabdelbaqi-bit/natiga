<?php

namespace App\Http\Controllers\Api;

use App\Domain\Sales\SalesReturnService;
use App\Domain\Treasury\CashTransferService;
use App\Domain\Treasury\CollectionService;
use App\Domain\Treasury\ExpenseService;
use App\Models\CashTransfer;
use App\Models\Expense;
use App\Models\Receipt;
use App\Models\SalesReturn;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TreasuryController extends BaseApiController
{
    protected array $sortable = ['code', 'receipt_date', 'amount'];

    protected array $searchable = ['receipts.code', 'receipts.field_no'];

    public function __construct(
        private readonly CollectionService $collections,
        private readonly CashTransferService $transfers,
        private readonly ExpenseService $expenses,
        private readonly SalesReturnService $returns,
    ) {}

    public function receipts(Request $request): JsonResponse
    {
        $query = Receipt::query()
            ->with(['customer:id,code,name', 'rep:id,name'])
            ->when($request->filled('customer_id'), fn ($q) => $q->where('customer_id', $request->integer('customer_id')))
            ->when($request->filled('rep_id'), fn ($q) => $q->where('rep_id', $request->integer('rep_id')))
            ->when($request->filled('from'), fn ($q) => $q->where('receipt_date', '>=', $request->string('from')))
            ->when($request->filled('to'), fn ($q) => $q->where('receipt_date', '<=', $request->string('to')))
            ->when(! $request->user()->hasPermission('treasury.receipt.view.all'),
                fn ($q) => $q->where('rep_id', $request->user()->id));

        return $this->paginated($query, $request, fn (Receipt $r) => [
            'id' => $r->id,
            'code' => $r->code,
            'field_no' => $r->field_no,
            'receipt_date' => $r->receipt_date->toDateString(),
            'customer' => $r->customer?->name,
            'rep' => $r->rep?->name,
            'method' => $r->method,
            'destination' => $r->destination,
            'amount' => (string) $r->amount,
            'allocated_amount' => (string) $r->allocated_amount,
            'unallocated' => $r->unallocatedAmount(),
            'status' => $r->status,
        ]);
    }

    public function storeReceipt(Request $request): JsonResponse
    {
        $data = $request->validate([
            'header.customer_id' => ['required', 'integer', 'exists:customers,id'],
            'header.amount' => ['required', 'numeric', 'gt:0'],
            'header.method' => ['required', 'in:cash,cheque,bank,card'],
            'header.destination' => ['required', 'in:custody,cash_box,bank'],
            'header.rep_id' => ['nullable', 'integer', 'exists:users,id'],
            'header.custody_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'header.cash_box_id' => ['nullable', 'integer', 'exists:cash_boxes,id'],
            'header.bank_id' => ['nullable', 'integer', 'exists:banks,id'],
            'header.receipt_date' => ['nullable', 'date'],
            'header.branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'header.cheque_no' => ['nullable', 'string', 'max:64'],
            'header.cheque_due_date' => ['nullable', 'date'],
            'header.cheque_issue_date' => ['nullable', 'date'],
            'header.drawer_bank' => ['nullable', 'string', 'max:120'],
            'header.auto_allocate' => ['nullable', 'boolean'],
            'header.notes' => ['nullable', 'string'],
            'allocations' => ['nullable', 'array'],
            'allocations.*.sales_invoice_id' => ['required', 'integer', 'exists:sales_invoices,id'],
            'allocations.*.amount' => ['required', 'numeric', 'gt:0'],
            'post' => ['nullable', 'boolean'],
        ]);

        $receipt = $this->collections->create($data['header'], $data['allocations'] ?? []);

        if ($data['post'] ?? false) {
            $receipt = $this->collections->post($receipt);
        }

        return response()->json(['receipt' => $receipt->load('allocations')], 201);
    }

    public function postReceipt(Receipt $receipt): JsonResponse
    {
        return response()->json(['receipt' => $this->collections->post($receipt)->load('allocations')]);
    }

    public function allocateReceipt(Request $request, Receipt $receipt): JsonResponse
    {
        $data = $request->validate([
            'allocations' => ['required', 'array', 'min:1'],
            'allocations.*.sales_invoice_id' => ['required', 'integer', 'exists:sales_invoices,id'],
            'allocations.*.amount' => ['required', 'numeric', 'gt:0'],
        ]);

        return response()->json([
            'receipt' => $this->collections->allocate($receipt, $data['allocations'])->load('allocations'),
        ]);
    }

    public function cancelReceipt(Request $request, Receipt $receipt): JsonResponse
    {
        $reason = $request->validate(['reason' => ['required', 'string', 'max:500']])['reason'];

        return response()->json(['receipt' => $this->collections->cancel($receipt, $reason)]);
    }

    /** Deposit from a rep's custody into a cash box or bank. */
    public function storeTransfer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from_kind' => ['required', 'in:custody,cash_box,bank'],
            'from_id' => ['required', 'integer'],
            'to_kind' => ['required', 'in:cash_box,bank'],
            'to_id' => ['required', 'integer'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'transfer_date' => ['nullable', 'date'],
            'reference' => ['nullable', 'string', 'max:64'],
            'notes' => ['nullable', 'string'],
            'post' => ['nullable', 'boolean'],
        ]);

        $transfer = $this->transfers->create($data);

        if ($data['post'] ?? false) {
            $transfer = $this->transfers->post($transfer);
        }

        return response()->json(['transfer' => $transfer], 201);
    }

    public function postTransfer(CashTransfer $cashTransfer): JsonResponse
    {
        return response()->json(['transfer' => $this->transfers->post($cashTransfer)]);
    }

    public function custodyBalance(Request $request): JsonResponse
    {
        $userId = $request->integer('user_id') ?: $request->user()->id;

        if ($userId !== $request->user()->id
            && ! $request->user()->hasPermission('treasury.custody.view.all')) {
            abort(403, 'لا تملك صلاحية الاطلاع على عهدة مستخدم آخر.');
        }

        return response()->json([
            'user_id' => $userId,
            'cash' => $this->transfers->custodyBalance($userId, 'cash'),
            'cheques' => $this->transfers->custodyBalance($userId, 'cheque'),
            'as_of' => now()->toIso8601String(),
        ]);
    }

    public function storeExpense(Request $request): JsonResponse
    {
        $data = $request->validate([
            'expense_date' => ['nullable', 'date'],
            'account_id' => ['required', 'integer', 'exists:accounts,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'tax_amount' => ['nullable', 'numeric', 'min:0'],
            'cost_center_id' => ['nullable', 'integer', 'exists:cost_centers,id'],
            'vehicle_id' => ['nullable', 'integer', 'exists:vehicles,id'],
            'paid_from_kind' => ['required', 'in:cash_box,bank,custody'],
            'paid_from_id' => ['required', 'integer'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'attachment_path' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'post' => ['nullable', 'boolean'],
        ]);

        $expense = $this->expenses->create($data);

        if (($data['post'] ?? false) && $expense->status === 'draft') {
            $expense = $this->expenses->post($expense);
        }

        return response()->json(['expense' => $expense], 201);
    }

    public function approveExpense(Request $request, Expense $expense): JsonResponse
    {
        $note = $request->input('note');

        return response()->json(['expense' => $this->expenses->approve($expense, $note)]);
    }

    // ------------------------------------------------------------ returns

    public function storeReturn(Request $request): JsonResponse
    {
        $data = $request->validate([
            'header.customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'header.sales_invoice_id' => ['nullable', 'integer', 'exists:sales_invoices,id'],
            'header.receipt_warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'header.rep_id' => ['nullable', 'integer', 'exists:users,id'],
            'header.return_date' => ['nullable', 'date'],
            'header.reason' => ['nullable', 'string', 'max:120'],
            'header.refund_method' => ['nullable', 'in:credit_note,cash,customer_credit'],
            'header.approval_id' => ['nullable', 'integer'],
            'header.notes' => ['nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.sales_invoice_line_id' => ['nullable', 'integer', 'exists:sales_invoice_lines,id'],
            'lines.*.item_id' => ['nullable', 'integer', 'exists:items,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.disposition' => ['nullable', 'in:sellable,inspection,damaged,return_to_supplier'],
            'lines.*.batch_id' => ['nullable', 'integer'],
            'lines.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'receive' => ['nullable', 'boolean'],
        ]);

        $return = $this->returns->create($data['header'], $data['lines']);

        if ($data['receive'] ?? false) {
            $return = $this->returns->receive($return);
        }

        return response()->json(['return' => $return->load('lines')], 201);
    }

    public function receiveReturn(SalesReturn $salesReturn): JsonResponse
    {
        return response()->json(['return' => $this->returns->receive($salesReturn)->load('lines')]);
    }

    public function postReturn(SalesReturn $salesReturn): JsonResponse
    {
        return response()->json(['return' => $this->returns->post($salesReturn)->load('lines')]);
    }
}
