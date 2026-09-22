<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Modules\Sales\Models\HeldCart;
use App\Modules\Sales\Services\HeldCartService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class HeldCartController extends Controller
{
    public function __construct(private readonly HeldCartService $carts) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(
            HeldCart::query()
                ->with(['user:id,name', 'customer:id,name'])
                ->where('branch_id', $request->attributes->get('pos.branch_id'))
                ->whereIn('status', ['open', 'recalled'])
                ->orderByDesc('updated_at')
                ->limit(100)
                ->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'label' => ['nullable', 'string', 'max:60'],
            'payload' => ['required', 'array'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
        ]);

        return response()->json(
            $this->carts->hold($data['label'] ?? '', $data['payload'], $data['customer_id'] ?? null),
            201,
        );
    }

    public function update(Request $request, HeldCart $heldCart): JsonResponse
    {
        $data = $request->validate([
            'payload' => ['required', 'array'],
            'version' => ['required', 'integer', 'min:1'],
        ]);

        return response()->json($this->carts->update($heldCart, $data['payload'], $data['version']));
    }

    public function recall(Request $request, HeldCart $heldCart): JsonResponse
    {
        $data = $request->validate(['version' => ['required', 'integer', 'min:1']]);

        $result = $this->carts->recall($heldCart, $data['version']);

        return response()->json([
            'cart' => $result['cart'],
            // Price/stock/expiry drift since the cart was parked, shown to the
            // cashier BEFORE the sale is confirmed.
            'differences' => $result['differences'],
        ]);
    }

    public function release(HeldCart $heldCart): JsonResponse
    {
        return response()->json($this->carts->release($heldCart));
    }

    public function destroy(Request $request, HeldCart $heldCart): JsonResponse
    {
        return response()->json($this->carts->cancel($heldCart, $request->input('reason')));
    }
}
