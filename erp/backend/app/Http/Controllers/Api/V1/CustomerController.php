<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Credit\CreditService;
use App\Domain\Shared\AuditLogger;
use App\Models\Customer;
use App\Models\CustomerAssignment;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * العملاء — مع تطبيق نطاق الوصول على مستوى السجل.
 *
 * المندوب لا يصل إلى عملاء غير مسندين إليه، ولو غيّر معرّف السجل في الطلب:
 * التحقق يتم في الاستعلام نفسه وليس بإخفاء عنصر في الواجهة.
 */
class CustomerController extends ApiController
{
    public function __construct(
        private readonly CreditService $credit,
        private readonly AuditLogger $audit,
    ) {}

    /** يطبّق قيد الإسناد والفروع على كل استعلام. */
    private function scoped(Request $request): Builder
    {
        $user = $request->user();

        $query = Customer::query()->where('company_id', $this->companyId($request));

        // من لا يملك customer.view_all يرى عملاءه المسندين فقط
        if (! $user->hasPermission('customer.view_all')) {
            $salesmanId = $user->salesmanId();

            if ($salesmanId !== null) {
                $query->where('salesman_id', $salesmanId);
            }
        }

        $branchScope = $user->scopeIds('branch');
        if ($branchScope !== [] && ! $user->is_super_admin) {
            $query->where(fn ($q) => $q->whereIn('branch_id', $branchScope)->orWhereNull('branch_id'));
        }

        return $query;
    }

    public function index(Request $request): JsonResponse
    {
        $query = $this->scoped($request)
            ->with(['salesman:id,name', 'region:id,name', 'priceList:id,name'])
            ->when($request->filled('region_id'), fn ($q) => $q->where('region_id', $request->input('region_id')))
            ->when($request->filled('salesman_id'), fn ($q) => $q->where('salesman_id', $request->input('salesman_id')))
            ->when($request->filled('is_blocked'), fn ($q) => $q->where('is_blocked', $request->boolean('is_blocked')))
            ->when($request->filled('grade'), fn ($q) => $q->where('grade', $request->input('grade')));

        return $this->paginate(
            $request,
            $query,
            searchable: ['name', 'code', 'phone'],
            sortable: ['name', 'code', 'credit_limit', 'last_sale_date', 'created_at'],
            sumColumns: ['credit_limit'],
        );
    }

    public function show(Request $request, int $id): JsonResponse
    {
        // firstOrFail على الاستعلام المقيّد: عميل خارج النطاق يعود 404 لا 200
        $customer = $this->scoped($request)->with(['addresses', 'contacts', 'salesman:id,name'])->findOrFail($id);

        return $this->ok([
            'customer' => $customer,
            'credit' => $this->credit->exposure($this->companyId($request), (int) $customer->id),
        ]);
    }

    public function statement(Request $request, int $id): JsonResponse
    {
        $customer = $this->scoped($request)->findOrFail($id);
        $from = $request->input('from', now()->startOfYear()->toDateString());
        $to = $request->input('to', now()->toDateString());

        $invoices = DB::table('sales_invoices')
            ->where('customer_id', $customer->id)
            ->where('status', '!=', 'cancelled')
            ->whereBetween('invoice_date', [$from, $to])
            ->select(DB::raw("invoice_date AS date"), DB::raw("'فاتورة بيع' AS doc_type"), 'invoice_no AS doc_no',
                DB::raw('total_amount AS debit'), DB::raw('0 AS credit'));

        $returns = DB::table('sales_returns')
            ->where('customer_id', $customer->id)
            ->where('status', 'posted')
            ->whereBetween('return_date', [$from, $to])
            ->select(DB::raw('return_date AS date'), DB::raw("'مرتجع مبيعات' AS doc_type"), 'return_no AS doc_no',
                DB::raw('0 AS debit'), DB::raw('total_amount AS credit'));

        $receipts = DB::table('customer_receipts')
            ->where('customer_id', $customer->id)
            ->where('status', 'posted')
            ->whereBetween('receipt_date', [$from, $to])
            ->select(DB::raw('receipt_date AS date'), DB::raw("'سند قبض' AS doc_type"), 'voucher_no AS doc_no',
                DB::raw('0 AS debit'), DB::raw('amount AS credit'));

        $rows = $invoices->unionAll($returns)->unionAll($receipts);

        $lines = DB::query()->fromSub($rows, 't')->orderBy('date')->orderBy('doc_no')->get();

        $balance = '0';
        $lines = $lines->map(function ($row) use (&$balance) {
            $balance = bcCompatAdd($balance, $row->debit, $row->credit);
            $row->running_balance = $balance;

            return $row;
        });

        return $this->ok([
            'customer' => ['id' => $customer->id, 'code' => $customer->code, 'name' => $customer->name],
            'period' => ['from' => $from, 'to' => $to],
            'lines' => $lines,
            'closing_balance' => $balance,
            'credit' => $this->credit->exposure($this->companyId($request), (int) $customer->id),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:40'],
            'name' => ['required', 'string', 'max:255'],
            'business_type' => ['nullable', 'string', 'max:30'],
            'region_id' => ['nullable', 'integer', 'exists:regions,id'],
            'route_id' => ['nullable', 'integer', 'exists:routes,id'],
            'salesman_id' => ['nullable', 'integer', 'exists:salesmen,id'],
            'price_list_id' => ['nullable', 'integer', 'exists:price_lists,id'],
            'credit_limit' => ['nullable', 'numeric', 'min:0'],
            'payment_term_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string'],
            'tax_number' => ['nullable', 'string', 'max:50'],
            'latitude' => ['nullable', 'numeric'],
            'longitude' => ['nullable', 'numeric'],
        ]);

        $data['company_id'] = $this->companyId($request);
        $data['branch_id'] = $request->user()->branch_id;

        // المندوب الذي ينشئ عميلًا يُسند إليه تلقائيًا
        if (empty($data['salesman_id'])) {
            $data['salesman_id'] = $request->user()->salesmanId();
        }

        $customer = DB::transaction(function () use ($data) {
            $customer = Customer::create($data);

            if ($customer->salesman_id) {
                CustomerAssignment::create([
                    'company_id' => $customer->company_id,
                    'customer_id' => $customer->id,
                    'salesman_id' => $customer->salesman_id,
                    'from_date' => now()->toDateString(),
                ]);
            }

            return $customer;
        });

        $this->audit->log('create', 'customer', (int) $customer->id, $customer->code, null, $customer->toArray());

        return $this->ok($customer, status: 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $customer = $this->scoped($request)->findOrFail($id);
        $before = $customer->toArray();

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'business_type' => ['sometimes', 'nullable', 'string', 'max:30'],
            'region_id' => ['sometimes', 'nullable', 'integer', 'exists:regions,id'],
            'route_id' => ['sometimes', 'nullable', 'integer', 'exists:routes,id'],
            'price_list_id' => ['sometimes', 'nullable', 'integer', 'exists:price_lists,id'],
            'credit_limit' => ['sometimes', 'numeric', 'min:0'],
            'payment_term_days' => ['sometimes', 'integer', 'min:0', 'max:365'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'address' => ['sometimes', 'nullable', 'string'],
            'grade' => ['sometimes', 'nullable', 'string', 'max:5'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        // رفع الإيقاف وتغيير الحد الائتماني يحتاجان صلاحيات مستقلة
        if ($request->has('is_blocked')) {
            abort_unless($request->user()->hasPermission('customer.unblock'), 403, 'لا تملك صلاحية تغيير حالة الإيقاف.');
            $data['is_blocked'] = $request->boolean('is_blocked');
            $data['block_reason'] = $request->input('block_reason');
        }

        $customer->update($data);

        $this->audit->log('update', 'customer', (int) $customer->id, $customer->code, $before, $customer->fresh()->toArray());

        return $this->ok($customer->fresh());
    }

    /**
     * تغيير مندوب العميل — يحفظ تاريخ الإسناد ولا ينسب مبيعات الماضي للمندوب الجديد.
     */
    public function reassign(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'salesman_id' => ['required', 'integer', 'exists:salesmen,id'],
            'from_date' => ['nullable', 'date'],
            'reason' => ['nullable', 'string'],
        ]);

        $customer = Customer::where('company_id', $this->companyId($request))->findOrFail($id);
        $fromDate = $data['from_date'] ?? now()->toDateString();
        $before = ['salesman_id' => $customer->salesman_id];

        DB::transaction(function () use ($customer, $data, $fromDate, $request) {
            CustomerAssignment::where('customer_id', $customer->id)
                ->whereNull('to_date')
                ->update(['to_date' => $fromDate]);

            CustomerAssignment::create([
                'company_id' => $customer->company_id,
                'customer_id' => $customer->id,
                'salesman_id' => $data['salesman_id'],
                'from_date' => $fromDate,
                'assigned_by' => $request->user()->id,
                'reason' => $data['reason'] ?? null,
            ]);

            $customer->salesman_id = $data['salesman_id'];
            $customer->save();
        });

        $this->audit->log('reassign', 'customer', (int) $customer->id, $customer->code, $before, [
            'salesman_id' => $data['salesman_id'],
            'from_date' => $fromDate,
        ], $data['reason'] ?? null);

        return $this->ok([
            'customer' => $customer->fresh(),
            'note' => 'المبيعات السابقة تبقى منسوبة للمندوب السابق حسب تاريخ الإسناد.',
        ]);
    }

    public function aging(Request $request): JsonResponse
    {
        return $this->ok($this->credit->aging(
            $this->companyId($request),
            $request->input('customer_id') ? (int) $request->input('customer_id') : null,
            $request->input('as_of'),
        ));
    }
}
