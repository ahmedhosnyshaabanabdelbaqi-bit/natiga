<?php

declare(strict_types=1);

namespace App\Modules\Sales\Services;

use App\Modules\Catalog\Models\ProductVariant;
use App\Modules\Catalog\Services\PricingService;
use App\Modules\Core\Services\PosContext;
use App\Modules\Inventory\Services\InventoryService;
use App\Modules\Sales\Models\HeldCart;
use App\Support\Exceptions\ConcurrencyConflictException;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Held (parked) carts.
 *
 * Holding a cart does NOT reserve stock — it is a saved basket, not a booking.
 * (Reservations are a separate, opt-in feature with an expiry.)
 *
 * Two terminals cannot check out the same hold: recall takes an optimistic lock
 * (`version`) that the server re-checks, so the loser gets a clear conflict
 * instead of a duplicate sale.
 *
 * On recall the cart is RE-VALIDATED against today's prices, stock and expiry,
 * and any difference is reported to the cashier before the sale is confirmed.
 */
class HeldCartService
{
    public function __construct(
        private readonly PricingService $pricing,
        private readonly InventoryService $inventory,
        private readonly PosContext $context,
    ) {}

    /** @param array<string,mixed> $payload */
    public function hold(string $label, array $payload, ?int $customerId = null): HeldCart
    {
        return HeldCart::query()->create([
            'uuid' => (string) Str::uuid7(),
            'label' => $label !== '' ? $label : 'فاتورة '.now()->format('H:i:s'),
            'branch_id' => $this->context->branchId(),
            'terminal_id' => $this->context->terminalId(),
            'user_id' => $this->context->userId(),
            'customer_id' => $customerId,
            'payload' => $payload,
            'status' => 'open',
            'version' => 1,
            'updated_by' => $this->context->userId(),
        ]);
    }

    /** @param array<string,mixed> $payload */
    public function update(HeldCart $cart, array $payload, int $expectedVersion): HeldCart
    {
        $updated = DB::update(
            'UPDATE held_carts SET payload = ?, version = version + 1, updated_by = ?, updated_at = now()
              WHERE id = ? AND version = ? AND status = ?',
            [json_encode($payload, JSON_UNESCAPED_UNICODE), $this->context->userId(), $cart->id, $expectedVersion, 'open'],
        );

        if ($updated === 0) {
            throw new ConcurrencyConflictException(
                'تم تعديل الفاتورة المعلقة من جهاز آخر. أعد تحميلها قبل المتابعة.',
                'held_cart_version_conflict',
                409,
                ['held_cart_id' => $cart->id, 'expected_version' => $expectedVersion],
            );
        }

        return $cart->refresh();
    }

    /**
     * Claim a hold for this terminal.
     *
     * @return array{cart: HeldCart, differences: list<array<string,mixed>>}
     */
    public function recall(HeldCart $cart, int $expectedVersion): array
    {
        $claimed = DB::update(
            "UPDATE held_carts
                SET status = 'recalled', locked_by = ?, locked_terminal_id = ?, locked_at = now(),
                    version = version + 1, updated_at = now()
              WHERE id = ? AND version = ? AND status = 'open'",
            [$this->context->userId(), $this->context->terminalId(), $cart->id, $expectedVersion],
        );

        if ($claimed === 0) {
            $current = $cart->fresh();
            throw new ConcurrencyConflictException(
                $current && $current->status !== 'open'
                    ? 'الفاتورة المعلقة مستخدمة بالفعل على جهاز آخر.'
                    : 'تم تعديل الفاتورة المعلقة. أعد تحميلها قبل المتابعة.',
                'held_cart_already_claimed',
                409,
                ['held_cart_id' => $cart->id, 'status' => $current?->status, 'version' => $current?->version],
            );
        }

        $cart = $cart->refresh();

        return ['cart' => $cart, 'differences' => $this->validate($cart)];
    }

    public function release(HeldCart $cart): HeldCart
    {
        DB::update(
            "UPDATE held_carts SET status = 'open', locked_by = NULL, locked_terminal_id = NULL,
                    locked_at = NULL, version = version + 1, updated_at = now()
              WHERE id = ? AND status = 'recalled'",
            [$cart->id],
        );

        return $cart->refresh();
    }

    public function cancel(HeldCart $cart, ?string $reason = null): HeldCart
    {
        if ($cart->status === 'converted') {
            throw new InvalidOperationException('لا يمكن إلغاء فاتورة معلقة تم تحويلها إلى بيع.', 'held_cart_converted', 422);
        }

        $cart->forceFill(['status' => 'cancelled', 'version' => $cart->version + 1])->save();

        return $cart;
    }

    /**
     * Re-check a recalled cart against current reality.
     *
     * @return list<array<string,mixed>>
     */
    public function validate(HeldCart $cart): array
    {
        $differences = [];
        $lines = $cart->payload['lines'] ?? [];
        $priceList = $this->pricing->listFor($cart->payload['price_list_id'] ?? null);
        $warehouseId = (int) ($cart->payload['warehouse_id'] ?? 0);

        foreach ($lines as $index => $line) {
            $variant = ProductVariant::query()->with('product.units.unit')->find($line['variant_id'] ?? 0);
            if (! $variant || ! $variant->is_active) {
                $differences[] = ['line' => $index, 'type' => 'variant_unavailable', 'message' => 'الصنف لم يعد متاحًا.'];

                continue;
            }

            $productUnit = $variant->product->units->firstWhere('id', $line['product_unit_id'] ?? null)
                ?? $variant->product->defaultSaleUnit();

            $qty = Quantity::of((string) ($line['qty'] ?? '0'));

            // Price drift
            try {
                $current = $this->pricing->priceFor($variant, $productUnit, $priceList, $qty);
                $held = Money::of((string) ($line['unit_price'] ?? '0'));
                if (! $current->equals($held)) {
                    $differences[] = [
                        'line' => $index,
                        'type' => 'price_changed',
                        'old' => $held->toString(),
                        'new' => $current->toString(),
                        'message' => 'تغير سعر الصنف منذ تعليق الفاتورة.',
                    ];
                }
            } catch (InvalidOperationException $e) {
                $differences[] = ['line' => $index, 'type' => 'price_missing', 'message' => $e->getMessage()];
            }

            // Stock availability
            if ($warehouseId && $variant->product->isStocked()) {
                $needed = $qty->multipliedBy((string) $productUnit->factor);
                $available = $this->inventory->available($warehouseId, (int) $variant->id);
                if ($available->isLessThan($needed)) {
                    $differences[] = [
                        'line' => $index,
                        'type' => 'insufficient_stock',
                        'available' => $available->toString(),
                        'needed' => $needed->toString(),
                        'message' => 'الرصيد المتاح أقل من الكمية المعلقة.',
                    ];
                }
            }

            // Expiry, when batch tracking is in use
            if (! empty($line['batch_id'])) {
                $expiry = DB::table('batches')->where('id', $line['batch_id'])->value('expiry_date');
                if ($expiry && $expiry < now()->toDateString()) {
                    $differences[] = ['line' => $index, 'type' => 'batch_expired', 'expiry_date' => $expiry, 'message' => 'انتهت صلاحية الدفعة.'];
                }
            }
        }

        return $differences;
    }
}
