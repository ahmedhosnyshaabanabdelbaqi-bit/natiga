<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Services;

use App\Modules\Catalog\Models\Serial;
use App\Support\Exceptions\InvalidOperationException;
use App\Support\Money;

/**
 * Serial-tracked units (phones, appliances).
 *
 * A serial is a physical object: it can be in stock exactly once, sold exactly
 * once, and belongs to exactly one warehouse. `sale_line_serials` has a UNIQUE
 * index on serial_id, so even a race cannot put the same handset on two
 * invoices — the second one fails at the database.
 */
class SerialService
{
    /**
     * Lock and validate the serials being sold.
     *
     * @param  list<string>  $serials
     * @return list<Serial>
     */
    public function reserveForSale(int $variantId, int $warehouseId, array $serials): array
    {
        $out = [];

        foreach ($serials as $value) {
            $value = trim((string) $value);
            if ($value === '') {
                throw new InvalidOperationException('الرقم التسلسلي مطلوب.', 'serial_required');
            }

            $serial = Serial::query()
                ->where('variant_id', $variantId)
                ->where('serial', $value)
                ->lockForUpdate()
                ->first();

            if (! $serial) {
                throw new InvalidOperationException(
                    'الرقم التسلسلي غير معروف لهذا الصنف.',
                    'serial_unknown',
                    422,
                    ['serial' => $value, 'variant_id' => $variantId],
                );
            }

            if ($serial->status !== 'in_stock') {
                throw new InvalidOperationException(
                    'الرقم التسلسلي غير متاح للبيع (حالته: '.$serial->status.').',
                    'serial_not_available',
                    422,
                    ['serial' => $value, 'status' => $serial->status],
                );
            }

            if ((int) $serial->warehouse_id !== $warehouseId) {
                throw new InvalidOperationException(
                    'الرقم التسلسلي غير موجود في مخزن البيع.',
                    'serial_wrong_warehouse',
                    422,
                    ['serial' => $value, 'warehouse_id' => $serial->warehouse_id],
                );
            }

            $out[] = $serial;
        }

        return $out;
    }

    public function markSold(Serial $serial, int $saleLineId, ?int $warrantyMonths = null): void
    {
        $serial->forceFill([
            'status' => 'sold',
            'sale_line_id' => $saleLineId,
            'warranty_until' => $warrantyMonths ? now()->addMonths($warrantyMonths)->toDateString() : $serial->warranty_until,
        ])->save();
    }

    /**
     * Take a serial back. `$resalable` decides whether it re-enters sellable
     * stock or is quarantined for inspection/repair.
     */
    public function markReturned(Serial $serial, int $warehouseId, bool $resalable): void
    {
        $serial->forceFill([
            'status' => $resalable ? 'in_stock' : 'defective',
            'warehouse_id' => $warehouseId,
            'sale_line_id' => null,
        ])->save();
    }

    public function receive(int $variantId, string $serial, int $warehouseId, Money $cost, ?int $batchId = null, ?int $receiptLineId = null): Serial
    {
        $existing = Serial::query()->where('variant_id', $variantId)->where('serial', $serial)->first();

        if ($existing && $existing->status === 'in_stock') {
            throw new InvalidOperationException(
                'الرقم التسلسلي موجود بالفعل في المخزون.',
                'serial_duplicate',
                422,
                ['serial' => $serial],
            );
        }

        if ($existing) {
            $existing->forceFill([
                'status' => 'in_stock',
                'warehouse_id' => $warehouseId,
                'unit_cost' => $cost->toString(6),
                'batch_id' => $batchId,
                'receipt_line_id' => $receiptLineId,
                'sale_line_id' => null,
            ])->save();

            return $existing;
        }

        return Serial::query()->create([
            'variant_id' => $variantId,
            'serial' => $serial,
            'status' => 'in_stock',
            'warehouse_id' => $warehouseId,
            'unit_cost' => $cost->toString(6),
            'batch_id' => $batchId,
            'receipt_line_id' => $receiptLineId,
        ]);
    }
}
