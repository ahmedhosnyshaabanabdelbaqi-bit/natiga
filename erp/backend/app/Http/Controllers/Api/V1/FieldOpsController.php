<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Field\CashDepositService;
use App\Domain\Field\CommissionService;
use App\Domain\Field\DayClosureService;
use App\Domain\Field\ExpenseService;
use App\Domain\Sales\CustomerReceiptService;
use App\Domain\Sales\SalesReturnService;
use App\Models\DayClosure;
use App\Models\CustomerReceipt;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FieldOpsController extends ApiController
{
    public function __construct(
        private readonly CustomerReceiptService $receipts,
        private readonly CashDepositService $deposits,
        private readonly ExpenseService $expenses,
        private readonly DayClosureService $closures,
        private readonly SalesReturnService $returns,
        private readonly CommissionService $commissions,
    ) {}

    public function receiptsIndex(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = CustomerReceipt::query()
            ->where('company_id', $this->companyId($request))
            ->with(['customer:id,code,name', 'salesman:id,name'])
            ->when(! $user->hasPermission('customer.view_all') && $user->salesmanId(),
                fn ($q) => $q->where('salesman_id', $user->salesmanId()))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('receipt_date', '>=', $request->input('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('receipt_date', '<=', $request->input('to')))
            ->orderByDesc('receipt_date')->orderByDesc('id');

        return $this->paginate($request, $query, ['voucher_no', 'field_no'], ['receipt_date', 'amount'], ['amount']);
    }

    public function storeReceipt(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'receipt_date' => ['required', 'date'],
            'payment_method' => ['required', 'in:cash,bank_transfer,cheque,card'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'salesman_id' => ['nullable', 'integer', 'exists:salesmen,id'],
            'cash_box_id' => ['nullable', 'integer', 'exists:cash_boxes,id'],
            'bank_account_id' => ['nullable', 'integer', 'exists:bank_accounts,id'],
            'notes' => ['nullable', 'string'],
            'cheque' => ['nullable', 'array'],
            'cheque.cheque_no' => ['required_with:cheque', 'string', 'max:60'],
            'cheque.due_date' => ['required_with:cheque', 'date'],
            'cheque.bank_name' => ['nullable', 'string'],
            'allocations' => ['nullable', 'array'],
            'allocations.*.sales_invoice_id' => ['required', 'integer', 'exists:sales_invoices,id'],
            'allocations.*.amount' => ['required', 'numeric', 'gt:0'],
        ]);

        $data['company_id'] = $this->companyId($request);
        $data['branch_id'] = $request->user()->branch_id;
        $data['user_id'] = $request->user()->id;
        $data['salesman_id'] ??= $request->user()->salesmanId();

        return $this->ok($this->receipts->createAndPost($data)->load('allocations'), status: 201);
    }

    public function storeDeposit(Request $request): JsonResponse
    {
        $data = $request->validate([
            'deposit_date' => ['required', 'date'],
            'from_cash_box_id' => ['required', 'integer', 'exists:cash_boxes,id'],
            'to_cash_box_id' => ['nullable', 'integer', 'exists:cash_boxes,id'],
            'to_bank_account_id' => ['nullable', 'integer', 'exists:bank_accounts,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'salesman_id' => ['nullable', 'integer'],
            'reference_no' => ['nullable', 'string', 'max:60'],
            'notes' => ['nullable', 'string'],
        ]);

        $data['company_id'] = $this->companyId($request);
        $data['branch_id'] = $request->user()->branch_id;
        $data['user_id'] = $request->user()->id;

        return $this->ok($this->deposits->createAndPost($data), status: 201);
    }

    public function storeExpense(Request $request): JsonResponse
    {
        $data = $request->validate([
            'expense_date' => ['required', 'date'],
            'account_id' => ['required', 'integer', 'exists:accounts,id'],
            'category' => ['nullable', 'string', 'max:40'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'paid_from' => ['required', 'in:cash_box,bank,salesman_custody'],
            'cash_box_id' => ['nullable', 'integer'],
            'bank_account_id' => ['nullable', 'integer'],
            'salesman_id' => ['nullable', 'integer'],
            'vehicle_id' => ['nullable', 'integer'],
            'cost_center_id' => ['nullable', 'integer'],
            'description' => ['nullable', 'string'],
        ]);

        $data['company_id'] = $this->companyId($request);
        $data['branch_id'] = $request->user()->branch_id;
        $data['user_id'] = $request->user()->id;

        // الاعتماد صلاحية منفصلة عن الإنشاء
        $expense = $this->expenses->create($data);

        if ($request->user()->hasPermission('expense.approve') && $request->boolean('approve')) {
            $expense = $this->expenses->approve($expense, (int) $request->user()->id);
            $expense = $this->expenses->post($expense, (int) $request->user()->id);
        }

        return $this->ok($expense, status: 201);
    }

    public function approveExpense(Request $request, int $id): JsonResponse
    {
        $expense = \App\Models\Expense::where('company_id', $this->companyId($request))->findOrFail($id);

        // فصل المنشئ عن المعتمد في العمليات الحساسة
        abort_if(
            (int) $expense->created_by === (int) $request->user()->id && ! $request->user()->is_super_admin,
            403,
            'لا يجوز أن يعتمد منشئ المصروف مصروفه بنفسه.',
        );

        $expense = $this->expenses->approve($expense, (int) $request->user()->id);
        $expense = $this->expenses->post($expense, (int) $request->user()->id);

        return $this->ok($expense);
    }

    public function storeReturn(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'return_date' => ['required', 'date'],
            'sales_invoice_id' => ['nullable', 'integer', 'exists:sales_invoices,id'],
            'salesman_id' => ['nullable', 'integer'],
            'settlement_type' => ['nullable', 'in:credit_note,cash_refund'],
            'reason' => ['nullable', 'string'],
            'exception_reason' => ['nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.sales_invoice_line_id' => ['nullable', 'integer'],
            'lines.*.item_id' => ['required', 'integer'],
            'lines.*.uom_id' => ['required', 'integer'],
            'lines.*.qty_uom' => ['required', 'numeric', 'gt:0'],
            'lines.*.condition' => ['nullable', 'in:saleable,inspection,damaged,to_supplier'],
            'lines.*.unit_price' => ['nullable', 'numeric'],
        ]);

        $data['company_id'] = $this->companyId($request);
        $data['branch_id'] = $request->user()->branch_id;
        $data['user_id'] = $request->user()->id;
        $data['salesman_id'] ??= $request->user()->salesmanId();

        // المرتجع بلا فاتورة والاسترداد النقدي يحتاجان صلاحيات منفصلة
        if (empty($data['sales_invoice_id'])) {
            abort_unless($request->user()->hasPermission('sales_return.without_invoice'), 403,
                'المرتجع بلا فاتورة يحتاج اعتماد مخوّل.');
            $data['exception_approved_by'] = $request->user()->id;
        }

        if (($data['settlement_type'] ?? '') === 'cash_refund') {
            abort_unless($request->user()->hasPermission('sales_return.cash_refund'), 403,
                'الاسترداد النقدي يحتاج موافقة منفصلة.');
            $data['refund_approved_by'] = $request->user()->id;
        }

        // الاستلام الفعلي منفصل عن الاعتماد المالي
        $return = $this->returns->create($data);

        if ($request->user()->hasPermission('sales_return.receive')) {
            $return = $this->returns->receive($return, (int) $request->user()->id);
        }

        if ($request->boolean('post') && $request->user()->hasPermission('sales_return.post') && $return->status === 'received') {
            $return = $this->returns->post($return, (int) $request->user()->id);
            $this->commissions->adjustForReturn($return);
        }

        return $this->ok($return->load('lines'), status: 201);
    }

    public function receiveReturn(Request $request, int $id): JsonResponse
    {
        $return = \App\Models\SalesReturn::where('company_id', $this->companyId($request))->findOrFail($id);

        return $this->ok($this->returns->receive($return, (int) $request->user()->id)->load('lines'));
    }

    public function postReturn(Request $request, int $id): JsonResponse
    {
        $return = \App\Models\SalesReturn::where('company_id', $this->companyId($request))->findOrFail($id);
        $return = $this->returns->post($return, (int) $request->user()->id);
        $this->commissions->adjustForReturn($return);

        return $this->ok($return->load('lines'));
    }

    public function dayClosure(Request $request): JsonResponse
    {
        $salesmanId = (int) ($request->input('salesman_id') ?: $request->user()->salesmanId());
        $date = $request->input('date', now()->toDateString());

        abort_if($salesmanId === 0, 422, 'حدد المندوب.');

        $closure = $this->closures->openOrGet($this->companyId($request), $salesmanId, $date);
        $closure = $this->closures->calculate($closure);

        return $this->ok([
            'closure' => $closure,
            'goods_equation' => [
                'formula' => 'أول المدة + التحميل + مرتجعات العملاء − المبيعات − البونص − الرد للمخزن − التحويل الخارج − التالف = المتوقع',
                'opening' => $closure->goods_opening_value,
                'loaded' => $closure->goods_loaded_value,
                'returns_in' => $closure->goods_returns_in_value,
                'sold' => $closure->goods_sold_value,
                'bonus' => $closure->goods_bonus_value,
                'returned_to_warehouse' => $closure->goods_returned_to_wh_value,
                'transfer_out' => $closure->goods_transfer_out_value,
                'damaged' => $closure->goods_damaged_value,
                'expected' => $closure->goods_expected_value,
                'actual' => $closure->goods_actual_value,
                'variance' => $closure->goods_variance_value,
            ],
            'cash_equation' => [
                'formula' => 'أول المدة + المقبوضات النقدية + العهد المستلمة − الإيداعات − المصروفات − المردود نقدًا = المتوقع',
                'opening' => $closure->cash_opening,
                'collected' => $closure->cash_collected,
                'custody_received' => $closure->cash_custody_received,
                'deposited' => $closure->cash_deposited,
                'expenses' => $closure->cash_expenses,
                'refunds' => $closure->cash_refunds,
                'expected' => $closure->cash_expected,
                'actual' => $closure->cash_actual,
                'variance' => $closure->cash_variance,
                'excluded' => [
                    'bank_transfers' => $closure->bank_transfers_amount,
                    'cheques' => $closure->cheques_amount,
                    'note' => 'التحويل البنكي والشيكات لا يضافان إلى النقدية الموجودة مع المندوب.',
                ],
            ],
            'sync' => [
                'complete' => (bool) $closure->sync_complete,
                'pending_ops' => (int) $closure->pending_sync_ops,
            ],
        ]);
    }

    public function closeDay(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'goods_actual_value' => ['nullable', 'numeric'],
            'cash_actual' => ['nullable', 'numeric'],
            'variance_explanation' => ['nullable', 'string'],
            'sync_exception_reason' => ['nullable', 'string'],
        ]);

        $closure = DayClosure::where('company_id', $this->companyId($request))->findOrFail($id);

        $options = array_filter($data, fn ($v) => $v !== null);

        if (! empty($data['sync_exception_reason'])) {
            abort_unless($request->user()->hasPermission('day_closure.sync_exception'), 403,
                'منح استثناء من اكتمال المزامنة يحتاج صلاحية مخصصة.');
            $options['sync_exception_by'] = $request->user()->id;
        }

        return $this->ok($this->closures->close($closure, (int) $request->user()->id, $options));
    }

    public function reopenDay(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:5']]);

        $closure = DayClosure::where('company_id', $this->companyId($request))->findOrFail($id);

        return $this->ok($this->closures->reopen($closure, (int) $request->user()->id, $data['reason']));
    }

    public function commissionStatement(Request $request): JsonResponse
    {
        $salesmanId = (int) ($request->input('salesman_id') ?: $request->user()->salesmanId());
        abort_if($salesmanId === 0, 422, 'حدد المندوب.');

        // المندوب يرى كشفه فقط
        if (! $request->user()->hasPermission('commission.configure')) {
            abort_unless($salesmanId === $request->user()->salesmanId(), 403, 'لا تملك صلاحية عرض كشف مندوب آخر.');
        }

        return $this->ok($this->commissions->statement(
            $this->companyId($request),
            $salesmanId,
            $request->input('from', now()->startOfMonth()->toDateString()),
            $request->input('to', now()->endOfMonth()->toDateString()),
        ));
    }
}
