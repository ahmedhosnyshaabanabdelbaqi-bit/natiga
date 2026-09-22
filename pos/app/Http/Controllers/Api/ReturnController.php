<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Modules\Sales\Models\SaleReturn;
use App\Modules\Sales\Services\ReturnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ReturnController extends Controller
{
    public function __construct(private readonly ReturnService $returns) {}

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sale_id' => ['required', 'integer', 'exists:sales,id'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.sale_line_id' => ['required', 'integer', 'exists:sale_lines,id'],
            'lines.*.qty' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'lines.*.disposition' => ['nullable', 'in:resalable,damaged,inspection,returns_warehouse'],
            'lines.*.serials' => ['nullable', 'array'],
            'lines.*.serials.*' => ['string', 'max:80'],
            'refund_method_id' => ['nullable', 'integer', 'exists:payment_methods,id'],
            'reason' => ['nullable', 'string', 'max:120'],
            'approval_uuid' => ['nullable', 'uuid'],
        ]);

        $data['idempotency_key'] = $request->header('Idempotency-Key');

        $result = $this->returns->process($data);

        return response()->json(
            $result['response'] + ['replayed' => $result['replayed']],
            $result['replayed'] ? 200 : 201,
        );
    }

    public function show(SaleReturn $saleReturn): JsonResponse
    {
        return response()->json($this->returns->present($saleReturn));
    }

    public function index(Request $request): JsonResponse
    {
        $query = SaleReturn::query()
            ->with(['sale:id,number', 'user:id,name'])
            ->when($request->attributes->get('pos.branch_id'), fn ($q, $v) => $q->where('branch_id', $v))
            ->when($request->query('from'), fn ($q, $v) => $q->where('business_date', '>=', $v))
            ->when($request->query('to'), fn ($q, $v) => $q->where('business_date', '<=', $v))
            ->when($request->query('without_invoice'), fn ($q) => $q->where('without_invoice', true))
            ->orderByDesc('returned_at');

        return response()->json($query->paginate(min((int) $request->query('per_page', 25), 200)));
    }
}
