<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Modules\Cash\Models\PaymentMethod;
use App\Modules\Catalog\Models\Category;
use App\Modules\Catalog\Services\ProductLookupService;
use App\Modules\Core\Models\Warehouse;
use App\Modules\Core\Services\PosContext;
use App\Modules\Core\Services\SettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/** Everything the till screen needs to run. */
class PosController extends Controller
{
    public function __construct(
        private readonly ProductLookupService $lookup,
        private readonly SettingsService $settings,
        private readonly PosContext $context,
    ) {}

    /** One call on till start-up: layout, methods, categories, shift state. */
    public function bootstrap(Request $request): JsonResponse
    {
        $terminal = $this->context->terminal();
        $branchId = $this->context->branchId();
        $shift = $this->context->shift();

        return response()->json([
            'terminal' => $terminal ? [
                'id' => $terminal->id,
                'code' => $terminal->code,
                'name' => $terminal->name,
                'warehouse_id' => $terminal->warehouse_id,
                'offline_allowed' => (bool) $terminal->offline_allowed,
                'offline_max_sale_amount' => $terminal->offline_max_sale_amount,
            ] : null,
            'branch_id' => $branchId,
            'shift' => $shift ? [
                'id' => $shift->id,
                'number' => $shift->number,
                'opened_at' => $shift->opened_at?->toIso8601String(),
                'user_id' => $shift->user_id,
                'status' => $shift->status,
            ] : null,
            'layout' => $this->settings->get('pos_layout', 'barcode_first', $branchId),
            'features' => $this->settings->features($branchId),
            'currency' => [
                'code' => $this->settings->currency(),
                'scale' => (int) config('pos.currency.scale', 2),
                'cash_step' => (string) config('pos.currency.cash_step', '0'),
            ],
            'payment_methods' => PaymentMethod::query()->where('is_active', true)->orderBy('sort_order')
                ->get(['id', 'code', 'name', 'type', 'affects_drawer', 'allows_change', 'requires_reference', 'allowed_offline']),
            'categories' => Category::query()->where('is_active', true)->orderBy('sort_order')
                ->get(['id', 'name', 'parent_id', 'color', 'image_path']),
            'server_time' => now()->toIso8601String(),
        ]);
    }

    public function scan(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:64'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'price_list_id' => ['nullable', 'integer', 'exists:price_lists,id'],
        ]);

        $result = $this->lookup->scan(
            $data['code'],
            $this->resolveWarehouseId($data['warehouse_id'] ?? null),
            $data['price_list_id'] ?? null,
        );

        if (! $result) {
            // A distinct code so the till can play the "not found" tone and,
            // with permission, offer to create the item — never invent one.
            return response()->json([
                'message' => 'الباركود غير معروف.',
                'error_code' => 'barcode_not_found',
                'context' => ['code' => $data['code']],
            ], 404);
        }

        return response()->json($result);
    }

    public function search(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'favorites' => ['nullable', 'boolean'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'price_list_id' => ['nullable', 'integer', 'exists:price_lists,id'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        return response()->json($this->lookup->search(
            term: $data['q'] ?? '',
            warehouseId: $this->resolveWarehouseId($data['warehouse_id'] ?? null),
            priceListId: $data['price_list_id'] ?? null,
            categoryId: $data['category_id'] ?? null,
            favoritesOnly: (bool) ($data['favorites'] ?? false),
            page: (int) ($data['page'] ?? 1),
            perPage: (int) ($data['per_page'] ?? 50),
        ));
    }

    private function resolveWarehouseId(?int $requested): int
    {
        if ($requested) {
            return $requested;
        }

        $terminal = $this->context->terminal();
        if ($terminal?->warehouse_id) {
            return (int) $terminal->warehouse_id;
        }

        return (int) Warehouse::query()
            ->where('branch_id', $this->context->branchId())
            ->where('is_default', true)
            ->value('id');
    }
}
