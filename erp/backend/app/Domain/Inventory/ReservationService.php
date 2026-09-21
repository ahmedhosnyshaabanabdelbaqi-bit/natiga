<?php

namespace App\Domain\Inventory;

use App\Domain\Shared\DomainException;
use App\Models\StockReservation;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * الحجز وفك الحجز. الحجز يقلّل المتاح للبيع دون تحريك الرصيد الفعلي.
 */
class ReservationService
{
    public function __construct(private readonly AvailabilityService $availability) {}

    public function reserve(
        int $companyId,
        int $itemId,
        int $warehouseId,
        mixed $qtyBase,
        string $docType,
        int $docId,
        ?int $docLineId = null,
        ?int $batchId = null,
        ?string $expiresAt = null,
        ?int $userId = null,
    ): StockReservation {
        if (! DB::transactionLevel()) {
            throw DomainException::make('reservation.no_transaction', 'الحجز يجب أن يتم داخل معاملة قاعدة بيانات.');
        }

        $qty = Dec::round($qtyBase, Dec::SCALE_QTY);

        if (! $qty->isPositive()) {
            throw DomainException::make('reservation.invalid_qty', 'كمية الحجز يجب أن تكون موجبة.');
        }

        // قفل صفوف الرصيد قبل حساب المتاح حتى لا يحجز طلبان نفس الكمية
        DB::table('stock_balances')
            ->where('company_id', $companyId)
            ->where('item_id', $itemId)
            ->where('warehouse_id', $warehouseId)
            ->whereIn('status_bucket', StockLedger::SELLABLE_BUCKETS)
            ->lockForUpdate()
            ->get();

        $state = $this->availability->forItem($companyId, $itemId, $warehouseId, $batchId);

        if (Dec::lt($state['available'], $qty)) {
            throw DomainException::make(
                'reservation.insufficient',
                "المتاح للحجز {$state['available']} فقط والمطلوب {$qty} (الرصيد {$state['on_hand']} منه محجوز {$state['reserved']}).",
                $state,
            );
        }

        return StockReservation::create([
            'company_id' => $companyId,
            'item_id' => $itemId,
            'warehouse_id' => $warehouseId,
            'batch_id' => $batchId,
            'qty_base' => (string) $qty,
            'doc_type' => $docType,
            'doc_id' => $docId,
            'doc_line_id' => $docLineId,
            'status' => 'active',
            'expires_at' => $expiresAt,
            'created_by' => $userId,
        ]);
    }

    /** استهلاك الحجز عند التسليم الفعلي. */
    public function consume(string $docType, int $docId, ?int $docLineId = null, mixed $qtyBase = null): void
    {
        $query = StockReservation::query()
            ->where('doc_type', $docType)
            ->where('doc_id', $docId)
            ->where('status', 'active')
            ->when($docLineId !== null, fn ($q) => $q->where('doc_line_id', $docLineId))
            ->lockForUpdate();

        if ($qtyBase === null) {
            $query->update(['status' => 'consumed']);

            return;
        }

        $remaining = Dec::of($qtyBase);

        foreach ($query->get() as $reservation) {
            if (! $remaining->isPositive()) {
                break;
            }

            if (Dec::lte($reservation->qty_base, $remaining)) {
                $remaining = Dec::sub($remaining, $reservation->qty_base);
                $reservation->status = 'consumed';
                $reservation->save();
            } else {
                $reservation->qty_base = (string) Dec::sub($reservation->qty_base, $remaining);
                $reservation->save();
                $remaining = Dec::of(0);
            }
        }
    }

    public function release(string $docType, int $docId, ?int $docLineId = null): int
    {
        return StockReservation::query()
            ->where('doc_type', $docType)
            ->where('doc_id', $docId)
            ->where('status', 'active')
            ->when($docLineId !== null, fn ($q) => $q->where('doc_line_id', $docLineId))
            ->update(['status' => 'released']);
    }

    /** تنظيف الحجوزات المنتهية (يُشغَّل من مهمة مجدولة). */
    public function expireStale(): int
    {
        return StockReservation::query()
            ->where('status', 'active')
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->update(['status' => 'expired']);
    }
}
