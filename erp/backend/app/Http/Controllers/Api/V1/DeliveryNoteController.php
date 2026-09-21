<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Sales\DeliveryNoteService;
use App\Models\DeliveryNote;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeliveryNoteController extends ApiController
{
    public function __construct(private readonly DeliveryNoteService $service) {}

    private function scoped(Request $request): Builder
    {
        $user = $request->user();

        $query = DeliveryNote::query()->where('company_id', $this->companyId($request));

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
            ->with(['customer:id,code,name', 'salesman:id,name', 'warehouse:id,name', 'vehicle:id,plate_no'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->when($request->filled('customer_id'), fn ($q) => $q->where('customer_id', $request->input('customer_id')))
            ->when($request->filled('sales_order_id'), fn ($q) => $q->where('sales_order_id', $request->input('sales_order_id')))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('delivery_date', '>=', $request->input('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('delivery_date', '<=', $request->input('to')))
            // أذون خرجت ولم تُفوتر — شاشة عمل المحاسب
            ->when($request->boolean('uninvoiced_only'), fn ($q) => $q->where('is_invoiced', false)->whereIn('status', ['delivered', 'partially_delivered']))
            ->orderByDesc('delivery_date')
            ->orderByDesc('id');

        return $this->paginate(
            $request,
            $query,
            searchable: ['delivery_no', 'receiver_name'],
            sortable: ['delivery_date', 'delivery_no'],
        );
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $note = $this->scoped($request)
            ->with([
                'lines.item:id,code,name_ar',
                'lines.uom:id,code,name_ar',
                'customer',
                'salesman:id,name',
                'warehouse:id,name',
                'salesOrder:id,order_no,order_date',
            ])
            ->findOrFail($id);

        $payload = $note->toArray();

        // التكلفة لا تُرسل أصلًا لمن لا يملك صلاحيتها — إخفاء العمود في الواجهة ليس حماية
        if (! $request->user()->canSeeCost()) {
            foreach ($payload['lines'] as &$line) {
                unset($line['unit_cost']);
            }
        }

        return $this->ok($payload);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sales_order_id' => ['nullable', 'integer', 'exists:sales_orders,id'],
            'customer_id' => ['required_without:sales_order_id', 'integer', 'exists:customers,id'],
            'warehouse_id' => ['required_without:sales_order_id', 'integer', 'exists:warehouses,id'],
            'delivery_date' => ['nullable', 'date'],
            'salesman_id' => ['nullable', 'integer', 'exists:salesmen,id'],
            'vehicle_id' => ['nullable', 'integer', 'exists:vehicles,id'],
            'driver_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'notes' => ['nullable', 'string'],
            'dispatch' => ['nullable', 'boolean'],
            'lines' => ['nullable', 'array', 'min:1'],
            'lines.*.sales_order_line_id' => ['nullable', 'integer', 'exists:sales_order_lines,id'],
            'lines.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'lines.*.uom_id' => ['required', 'integer', 'exists:uoms,id'],
            'lines.*.qty_uom' => ['required', 'numeric', 'gt:0'],
            'lines.*.batch_id' => ['nullable', 'integer', 'exists:stock_batches,id'],
        ]);

        $data['company_id'] = $this->companyId($request);
        $data['branch_id'] = $request->user()->branch_id;
        $data['user_id'] = $request->user()->id;

        $dispatch = (bool) ($data['dispatch'] ?? true);
        unset($data['dispatch']);

        if ($dispatch) {
            abort_unless($request->user()->hasPermission('delivery_note.post'), 403, 'لا تملك صلاحية إخراج البضاعة بإذن تسليم.');
            $note = $this->service->createAndDispatch($data);
        } else {
            $note = $this->service->create($data);
        }

        return $this->ok($note->load('lines'), status: 201);
    }

    public function dispatchNote(Request $request, int $id): JsonResponse
    {
        $note = $this->scoped($request)->findOrFail($id);

        return $this->ok($this->service->dispatch($note, (int) $request->user()->id)->load('lines'));
    }

    public function confirm(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'receiver_name' => ['nullable', 'string', 'max:255'],
            'proof_code' => ['nullable', 'string', 'max:20'],
            'signature_path' => ['nullable', 'string', 'max:255'],
            'results' => ['nullable', 'array'],
            'results.*.line_id' => ['required', 'integer'],
            'results.*.delivered_qty_base' => ['required', 'numeric', 'min:0'],
            'results.*.rejection_reason' => ['nullable', 'string'],
        ]);

        $note = $this->scoped($request)->findOrFail($id);

        $confirmed = $this->service->confirm(
            $note,
            $data['results'] ?? [],
            [
                'receiver_name' => $data['receiver_name'] ?? null,
                'proof_code' => $data['proof_code'] ?? null,
                'signature_path' => $data['signature_path'] ?? null,
            ],
            (int) $request->user()->id,
        );

        return $this->ok($confirmed->load('lines'));
    }

    public function fail(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'min:3'],
            'rescheduled_to' => ['nullable', 'date', 'after_or_equal:today'],
        ]);

        $note = $this->scoped($request)->findOrFail($id);

        return $this->ok($this->service->fail(
            $note,
            $data['reason'],
            $data['rescheduled_to'] ?? null,
            (int) $request->user()->id,
        )->load('lines'));
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3']]);
        $note = $this->scoped($request)->findOrFail($id);

        return $this->ok($this->service->cancel($note, $data['reason'], (int) $request->user()->id));
    }
}
