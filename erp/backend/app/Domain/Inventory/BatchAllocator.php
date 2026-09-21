<?php

namespace App\Domain\Inventory;

use App\Domain\Shared\DomainException;
use App\Models\Item;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * توزيع الكمية المطلوبة على الدفعات الموجودة.
 *
 * السياسة الافتراضية: الصرف بالأقرب انتهاءً (FEFO) للأصناف ذات الصلاحية،
 * والدفعات بلا تاريخ صلاحية تأتي في النهاية.
 *
 * يُستدعى عندما لا يحدد المستخدم دفعة صراحةً. إذا حدد دفعة، تُستخدم كما هي.
 */
class BatchAllocator
{
    /**
     * @return array<int, array{batch_id:int|null, qty:string, expiry_date:string|null}>
     */
    public function allocate(
        int $companyId,
        int $itemId,
        int $warehouseId,
        mixed $qtyBase,
        string $bucket = StockLedger::BUCKET_AVAILABLE,
        bool $enforceExpiry = true,
    ): array {
        $required = Dec::round($qtyBase, Dec::SCALE_QTY);

        if (! $required->isPositive()) {
            throw DomainException::make('allocation.invalid_qty', 'الكمية المطلوب توزيعها يجب أن تكون موجبة.');
        }

        $item = Item::find($itemId);
        $blockDays = (int) ($item?->block_sale_days_before_expiry ?? 0);
        $threshold = now()->addDays($blockDays)->toDateString();

        // قفل صفوف الرصيد قبل التوزيع حتى لا يوزع طلبان نفس الدفعة
        $rows = DB::table('stock_balances as sb')
            ->leftJoin('stock_batches as b', 'b.id', '=', 'sb.batch_id')
            ->where('sb.company_id', $companyId)
            ->where('sb.item_id', $itemId)
            ->where('sb.warehouse_id', $warehouseId)
            ->where('sb.status_bucket', $bucket)
            ->where('sb.qty_base', '>', 0)
            ->orderByRaw('b.expiry_date ASC NULLS LAST')
            ->orderBy('sb.id')
            // PostgreSQL لا يسمح بقفل الطرف القابل للـNULL من الوصلة الخارجية،
            // لذا نقفل صفوف الأرصدة فقط.
            ->lock('FOR UPDATE OF sb')
            ->get(['sb.id', 'sb.batch_id', 'sb.qty_base', 'b.expiry_date', 'b.batch_no']);

        $allocation = [];
        $remaining = $required;
        $skippedExpired = [];

        foreach ($rows as $row) {
            if (! $remaining->isPositive()) {
                break;
            }

            // الأصناف المنتهية أو القريبة من الانتهاء تُستبعد من الصرف للبيع
            if ($enforceExpiry && $item?->track_expiry && $row->expiry_date !== null && $row->expiry_date <= $threshold) {
                $skippedExpired[] = $row->batch_no ?? (string) $row->batch_id;

                continue;
            }

            $take = Dec::min($remaining, $row->qty_base);

            $allocation[] = [
                'batch_id' => $row->batch_id !== null ? (int) $row->batch_id : null,
                'qty' => (string) Dec::round($take, Dec::SCALE_QTY),
                'expiry_date' => $row->expiry_date,
            ];

            $remaining = Dec::sub($remaining, $take);
        }

        if ($remaining->isPositive()) {
            $message = sprintf(
                'الرصيد القابل للصرف غير كافٍ للصنف «%s»: المطلوب %s والمتبقي غير مغطى %s.',
                $item?->name_ar ?? $itemId,
                Dec::qty($required),
                Dec::qty($remaining),
            );

            if ($skippedExpired !== []) {
                $message .= ' (استُبعدت دفعات منتهية أو قريبة الانتهاء: '.implode('، ', array_unique($skippedExpired)).')';
            }

            throw DomainException::make('stock.insufficient', $message, [
                'item_id' => $itemId,
                'warehouse_id' => $warehouseId,
                'requested' => (string) $required,
                'uncovered' => (string) $remaining,
                'skipped_expired_batches' => $skippedExpired,
            ]);
        }

        return $allocation;
    }
}
