<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Models\CustomerLedgerEntry;
use App\Modules\Customers\Services\CollectionService;
use App\Modules\Customers\Services\CustomerLedgerService;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;

class CustomerController extends Controller
{
    public function __construct(
        private readonly CollectionService $collections,
        private readonly CustomerLedgerService $ledger,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = Customer::query()
            ->where('is_active', true)
            ->when($request->query('q'), function ($q, $term) {
                $like = '%'.$term.'%';
                $q->where(fn ($w) => $w->where('name', 'ILIKE', $like)
                    ->orWhere('phone', 'ILIKE', $like)
                    ->orWhere('code', 'ILIKE', $like));
            })
            ->when($request->boolean('with_debt'), fn ($q) => $q->where('balance', '>', 0))
            ->orderBy('name');

        return response()->json($query->paginate(min((int) $request->query('per_page', 25), 200)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'phone' => ['nullable', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:160'],
            'address' => ['nullable', 'string', 'max:500'],
            'tax_number' => ['nullable', 'string', 'max:64'],
            'type' => ['nullable', 'in:retail,wholesale'],
            'price_list_id' => ['nullable', 'integer', 'exists:price_lists,id'],
            'allow_credit' => ['boolean'],
            'credit_limit' => ['nullable', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'payment_terms_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'opening_balance' => ['nullable', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
        ]);

        $customer = Customer::query()->create($data + [
            'code' => 'C-'.strtoupper(Str::random(8)),
            'is_active' => true,
        ]);

        // An opening balance is a documented ledger entry, not a magic number.
        if (! empty($data['opening_balance']) && $data['opening_balance'] !== '0') {
            $this->ledger->debit(
                $customer,
                Money::of($data['opening_balance']),
                'opening',
                $customer,
                'رصيد افتتاحي',
            );
            $customer->forceFill(['opening_balance_date' => now()->toDateString()])->save();
        }

        return response()->json($customer->refresh(), 201);
    }

    public function show(Customer $customer): JsonResponse
    {
        return response()->json([
            'customer' => $customer,
            'outstanding' => Money::of($customer->balance)->toString(),
            'open_invoices' => $this->ledger->openInvoices($customer),
        ]);
    }

    public function update(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:160'],
            'phone' => ['nullable', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:160'],
            'address' => ['nullable', 'string', 'max:500'],
            'type' => ['nullable', 'in:retail,wholesale'],
            'price_list_id' => ['nullable', 'integer', 'exists:price_lists,id'],
            'allow_credit' => ['boolean'],
            'credit_limit' => ['nullable', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'payment_terms_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'is_active' => ['boolean'],
        ]);

        $customer->update($data);

        return response()->json($customer->refresh());
    }

    public function statement(Request $request, Customer $customer): JsonResponse
    {
        $entries = CustomerLedgerEntry::query()
            ->where('customer_id', $customer->id)
            ->when($request->query('from'), fn ($q, $v) => $q->where('entry_date', '>=', $v))
            ->when($request->query('to'), fn ($q, $v) => $q->where('entry_date', '<=', $v))
            ->orderBy('id')
            ->paginate(min((int) $request->query('per_page', 50), 200));

        return response()->json([
            'customer' => ['id' => $customer->id, 'name' => $customer->name, 'balance' => $customer->balance],
            'entries' => $entries,
        ]);
    }

    public function collect(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'payment_method_id' => ['required', 'integer', 'exists:payment_methods,id'],
            'amount' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'reference' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:500'],
            'allocations' => ['nullable', 'array'],
            'allocations.*.sale_id' => ['required', 'integer', 'exists:sales,id'],
            'allocations.*.amount' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
        ]);

        $result = $this->collections->collect($data + [
            'customer_id' => $customer->id,
            'idempotency_key' => $request->header('Idempotency-Key'),
        ]);

        return response()->json(
            $result['response'] + ['replayed' => $result['replayed']],
            $result['replayed'] ? 200 : 201,
        );
    }
}
