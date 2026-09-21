<?php

namespace App\Http\Controllers\Api;

use App\Domain\Support\Num;
use App\Domain\Credit\CreditService;
use App\Models\Customer;
use App\Models\CustomerAssignment;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustomerController extends BaseApiController
{
    protected array $sortable = ['code', 'name', 'credit_limit', 'created_at'];

    protected array $searchable = ['customers.code', 'customers.name', 'customers.phone'];

    public function __construct(private readonly CreditService $credit) {}

    public function index(Request $request): JsonResponse
    {
        $query = $this->scopedQuery($request)
            ->with(['region:id,name', 'route:id,name', 'priceList:id,name'])
            ->when($request->filled('region_id'), fn ($q) => $q->where('region_id', $request->integer('region_id')))
            ->when($request->filled('route_id'), fn ($q) => $q->where('route_id', $request->integer('route_id')))
            ->when($request->filled('kind'), fn ($q) => $q->where('kind', $request->string('kind')))
            ->when($request->boolean('only_overdue'), fn ($q) => $q->whereExists(
                fn ($sub) => $sub->select(DB::raw(1))->from('sales_invoices')
                    ->whereColumn('sales_invoices.customer_id', 'customers.id')
                    ->where('sales_invoices.status', 'posted')
                    ->whereRaw('sales_invoices.total - sales_invoices.paid_amount - sales_invoices.returned_amount > 0')
                    ->whereDate('sales_invoices.due_date', '<', now())
            ));

        return $this->paginated($query, $request, fn (Customer $c) => [
            'id' => $c->id,
            'code' => $c->code,
            'name' => $c->name,
            'kind' => $c->kind,
            'phone' => $c->phone,
            'region' => $c->region?->name,
            'route' => $c->route?->name,
            'price_list' => $c->priceList?->name,
            'credit_limit' => (string) $c->credit_limit,
            'credit_hold' => $c->credit_hold,
            'classification' => $c->classification,
            'is_active' => $c->is_active,
        ]);
    }

    public function show(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeReach($request, $customer);

        $customer->load(['region', 'route', 'priceList', 'addresses', 'contacts']);

        return response()->json([
            'customer' => $customer->toArray(),
            'credit' => $this->credit->exposure($customer),
            'current_rep_id' => $customer->currentRepId(),
            'assignment_history' => $customer->assignments()
                ->with('rep:id,name')->orderByDesc('from_date')->get()
                ->map(fn ($a) => [
                    'rep' => $a->rep?->name,
                    'from_date' => $a->from_date?->toDateString(),
                    'to_date' => $a->to_date?->toDateString(),
                ]),
            'last_invoice_at' => $customer->invoices()->where('status', 'posted')->max('invoice_date'),
            'last_visit_at' => DB::table('visits')->where('customer_id', $customer->id)->max('business_date'),
        ]);
    }

    /** Statement of account: invoices, receipts and returns with a running balance. */
    public function statement(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeReach($request, $customer);

        $from = $request->input('from', now()->startOfYear()->toDateString());
        $to = $request->input('to', now()->toDateString());

        $opening = DB::table('journal_lines as jl')
            ->join('journal_entries as je', 'je.id', '=', 'jl.journal_entry_id')
            ->where('jl.partner_type', 'customer')
            ->where('jl.partner_id', $customer->id)
            ->where('je.status', 'posted')
            ->where('je.entry_date', '<', $from)
            ->selectRaw('COALESCE(SUM(jl.debit - jl.credit), 0) AS balance')
            ->value('balance');

        $rows = DB::table('journal_lines as jl')
            ->join('journal_entries as je', 'je.id', '=', 'jl.journal_entry_id')
            ->where('jl.partner_type', 'customer')
            ->where('jl.partner_id', $customer->id)
            ->where('je.status', 'posted')
            ->whereBetween('je.entry_date', [$from, $to])
            ->orderBy('je.entry_date')
            ->orderBy('je.id')
            ->select(['je.entry_date', 'je.entry_no', 'je.source_type', 'je.source_id',
                'je.memo', 'jl.debit', 'jl.credit'])
            ->get();

        $running = (string) $opening;
        $rows = $rows->map(function ($row) use (&$running) {
            $running = Num::add($running, Num::sub($row->debit, $row->credit, Num::MONEY_SCALE), Num::MONEY_SCALE);
            $row->balance = $running;

            return $row;
        });

        return response()->json([
            'customer' => ['id' => $customer->id, 'code' => $customer->code, 'name' => $customer->name],
            'from' => $from,
            'to' => $to,
            'opening_balance' => (string) $opening,
            'closing_balance' => $running,
            'rows' => $rows,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateCustomer($request);
        $repId = $data['rep_id'] ?? null;
        unset($data['rep_id']);

        $customer = DB::transaction(function () use ($data, $repId) {
            $customer = Customer::create($data);

            if ($repId) {
                CustomerAssignment::create([
                    'company_id' => $customer->company_id,
                    'customer_id' => $customer->id,
                    'rep_id' => $repId,
                    'from_date' => now()->toDateString(),
                    'assigned_by' => auth()->id(),
                ]);
            }

            return $customer;
        });

        return response()->json(['customer' => $customer], 201);
    }

    public function update(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeReach($request, $customer);

        $data = $this->validateCustomer($request, $customer);
        unset($data['rep_id']);

        $customer->update($data);

        return response()->json(['customer' => $customer->fresh()]);
    }

    /**
     * Reassign a customer to another rep.
     *
     * The previous assignment is closed with an end date rather than
     * overwritten, so past sales stay credited to whoever actually made them.
     */
    public function reassign(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'rep_id' => ['required', 'integer', 'exists:users,id'],
            'from_date' => ['nullable', 'date'],
            'note' => ['nullable', 'string'],
        ]);

        $fromDate = $data['from_date'] ?? now()->toDateString();

        DB::transaction(function () use ($customer, $data, $fromDate) {
            CustomerAssignment::query()
                ->where('customer_id', $customer->id)
                ->whereNull('to_date')
                ->update(['to_date' => \Illuminate\Support\Carbon::parse($fromDate)->subDay()->toDateString()]);

            CustomerAssignment::create([
                'company_id' => $customer->company_id,
                'customer_id' => $customer->id,
                'rep_id' => $data['rep_id'],
                'from_date' => $fromDate,
                'assigned_by' => auth()->id(),
                'note' => $data['note'] ?? null,
            ]);
        });

        return response()->json([
            'message' => 'تم تغيير المندوب المسؤول. المبيعات السابقة تبقى منسوبة للمندوب السابق.',
            'assignments' => $customer->assignments()->orderByDesc('from_date')->get(),
        ]);
    }

    public function credit(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeReach($request, $customer);

        return response()->json($this->credit->exposure($customer));
    }

    /**
     * A rep only ever sees the customers assigned to them.
     *
     * Applied to the query itself, so a rep cannot reach another rep's customer
     * by changing an id in the URL — see authorizeReach for the single-record
     * counterpart.
     */
    protected function scopedQuery(Request $request): Builder
    {
        $user = $request->user();
        $query = Customer::query();

        if (! $user->hasPermission('customers.view.all')) {
            $query->whereIn('id', $user->assignedCustomerIds());
        }

        return $query;
    }

    protected function authorizeReach(Request $request, Customer $customer): void
    {
        $user = $request->user();

        if ($user->hasPermission('customers.view.all')) {
            return;
        }

        if (! in_array($customer->id, $user->assignedCustomerIds(), true)) {
            abort(403, 'لا تملك صلاحية الوصول إلى هذا العميل.');
        }
    }

    protected function validateCustomer(Request $request, ?Customer $customer = null): array
    {
        $unique = 'unique:customers,code,'.($customer?->id ?? 'NULL').',id,company_id,'.$request->user()->company_id;

        return $request->validate([
            'code' => ['required', 'string', 'max:48', $unique],
            'name' => ['required', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'kind' => ['required', 'in:retail,wholesale,distributor,project,cash'],
            'business_type' => ['nullable', 'string', 'max:120'],
            'tax_id' => ['nullable', 'string', 'max:64'],
            'phone' => ['nullable', 'string', 'max:64'],
            'email' => ['nullable', 'email'],
            'address' => ['nullable', 'string'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'parent_id' => ['nullable', 'integer', 'exists:customers,id'],
            'region_id' => ['nullable', 'integer', 'exists:regions,id'],
            'route_id' => ['nullable', 'integer', 'exists:routes,id'],
            'price_list_id' => ['nullable', 'integer', 'exists:price_lists,id'],
            'discount_pct' => ['numeric', 'min:0', 'max:100'],
            'payment_terms_days' => ['integer', 'min:0'],
            'credit_limit' => ['numeric', 'min:0'],
            'credit_hold' => ['boolean'],
            'is_cash_only' => ['boolean'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'classification' => ['nullable', 'in:A,B,C,D'],
            'visit_days' => ['nullable', 'array'],
            'is_active' => ['boolean'],
            'notes' => ['nullable', 'string'],
            'rep_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);
    }
}
