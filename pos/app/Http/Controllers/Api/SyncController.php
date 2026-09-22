<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Modules\Cash\Models\PaymentMethod;
use App\Modules\Core\Services\PosContext;
use App\Modules\Sync\Models\DeviceSyncState;
use App\Modules\Sync\Models\OfflineOperation;
use App\Modules\Sync\Services\OfflineSyncService;
use App\Support\Exceptions\InvalidOperationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class SyncController extends Controller
{
    public function __construct(
        private readonly OfflineSyncService $sync,
        private readonly PosContext $context,
    ) {}

    /** Upload operations captured while the server was unreachable. */
    public function push(Request $request): JsonResponse
    {
        $data = $request->validate([
            'operations' => ['required', 'array', 'min:1', 'max:200'],
            'operations.*.uuid' => ['required', 'uuid'],
            'operations.*.type' => ['required', 'string', 'max:40'],
            'operations.*.payload' => ['required', 'array'],
            'operations.*.client_created_at' => ['nullable', 'date'],
        ]);

        $terminal = $this->context->terminal();
        if (! $terminal) {
            throw new InvalidOperationException('لم يتم تحديد جهاز الكاشير.', 'terminal_required');
        }

        return response()->json($this->sync->push($terminal, $data['operations']));
    }

    /**
     * Catalogue snapshot for the offline cache. Deliberately limited: enough to
     * scan and price, never the whole database.
     */
    public function pull(Request $request): JsonResponse
    {
        $terminal = $this->context->terminal();
        if (! $terminal) {
            throw new InvalidOperationException('لم يتم تحديد جهاز الكاشير.', 'terminal_required');
        }

        $since = $request->query('since');

        $products = DB::table('product_variants')
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->join('product_units', function ($join) {
                $join->on('product_units.product_id', '=', 'products.id')->where('product_units.is_base', true);
            })
            ->leftJoin('prices', function ($join) {
                $join->on('prices.variant_id', '=', 'product_variants.id')
                    ->on('prices.product_unit_id', '=', 'product_units.id')
                    ->where('prices.min_qty', '=', 0);
            })
            ->leftJoin('price_lists', 'price_lists.id', '=', 'prices.price_list_id')
            ->where('products.is_active', true)
            ->where('product_variants.is_active', true)
            ->whereNull('products.deleted_at')
            // Serial-tracked goods are never sold offline, so they are not cached.
            ->where('products.tracking', '!=', 'serial')
            ->when($since, fn ($q) => $q->where('product_variants.updated_at', '>=', $since))
            ->where(fn ($q) => $q->where('price_lists.is_default', true)->orWhereNull('price_lists.id'))
            ->limit(20000)
            ->get([
                'product_variants.id as variant_id',
                'product_variants.sku',
                'product_variants.name as variant_name',
                'products.id as product_id',
                'products.name',
                'products.type',
                'products.allow_fractional_qty',
                'product_units.id as product_unit_id',
                'prices.price as unit_price',
            ]);

        $barcodes = DB::table('barcodes')
            ->join('products', 'products.id', '=', 'barcodes.product_id')
            ->where('products.is_active', true)
            ->where('products.tracking', '!=', 'serial')
            ->limit(40000)
            ->get(['barcodes.code', 'barcodes.variant_id', 'barcodes.product_unit_id', 'barcodes.type']);

        DeviceSyncState::query()->updateOrCreate(
            ['terminal_id' => $terminal->id],
            ['last_pull_at' => now(), 'catalog_version' => (string) now()->timestamp],
        );

        return response()->json([
            'server_time' => now()->toIso8601String(),
            'catalog_version' => (string) now()->timestamp,
            'products' => $products,
            'barcodes' => $barcodes,
            'payment_methods' => PaymentMethod::query()
                ->where('is_active', true)->where('allowed_offline', true)
                ->get(['id', 'code', 'name', 'type', 'affects_drawer', 'allows_change']),
            'policy' => [
                'offline_allowed' => (bool) $terminal->offline_allowed,
                'max_hours' => (int) $terminal->offline_max_hours,
                'max_sale_amount' => $terminal->offline_max_sale_amount,
                'blocked_operations' => config('pos.offline.blocked_operations'),
            ],
        ]);
    }

    public function status(Request $request): JsonResponse
    {
        $terminal = $this->context->terminal();
        if (! $terminal) {
            throw new InvalidOperationException('لم يتم تحديد جهاز الكاشير.', 'terminal_required');
        }

        return response()->json($this->sync->status($terminal));
    }

    /** Operations parked for manager review. */
    public function conflicts(Request $request): JsonResponse
    {
        return response()->json(
            OfflineOperation::query()
                ->with('terminal:id,code,name')
                ->whereIn('status', ['conflict', 'rejected'])
                ->when($request->query('terminal_id'), fn ($q, $v) => $q->where('terminal_id', $v))
                ->orderByDesc('received_at')
                ->paginate(min((int) $request->query('per_page', 25), 200))
        );
    }

    public function resolve(Request $request, OfflineOperation $offlineOperation): JsonResponse
    {
        $data = $request->validate([
            'decision' => ['required', 'in:accept,reject'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        return response()->json([
            'operation' => $this->sync->resolve($offlineOperation, $request->user(), $data['decision'], $data['note'] ?? null),
        ]);
    }
}
