<?php

namespace App\Domain\Inventory;

use App\Domain\Shared\DomainException;
use App\Models\Item;
use App\Support\Dec;

/**
 * منسّق حركة المخزون: يربط محرك التكلفة بدفتر الحركات.
 *
 * - receive     : إدخال بتكلفة معلومة (شراء) — يغيّر المتوسط.
 * - issue       : إخراج بالمتوسط السائد (بيع / صرف) — يُرجع التكلفة المحفوظة في المستند.
 * - transferOut/In : تحويل داخلي بنفس التكلفة — لا يغيّر المتوسط ولا ينشئ ربحًا.
 * - returnIn    : مرتجع عميل بتكلفة البيع الأصلية.
 */
class StockPoster
{
    public function __construct(
        private readonly StockLedger $ledger,
        private readonly CostEngine $costs,
    ) {}

    /** @return array{unit_cost:string, total_cost:string} */
    public function receive(array $data): array
    {
        $qty = Dec::round($data['qty_base'], Dec::SCALE_QTY);
        $unitCost = Dec::round($data['unit_cost'], Dec::SCALE_COST);
        $totalCost = Dec::round(Dec::mul($qty, $unitCost), Dec::SCALE_MONEY);

        $this->ledger->record(array_merge($data, [
            'direction' => 'in',
            'unit_cost' => (string) $unitCost,
        ]));

        // البضاعة تحت الفحص أو في الحجر تدخل قيمة المخزون لكنها ليست متاحة للبيع
        $this->costs->receive(
            (int) $data['company_id'],
            (int) $data['item_id'],
            $qty,
            $totalCost,
            $data['doc_type'],
            (int) $data['doc_id'],
        );

        return ['unit_cost' => (string) $unitCost, 'total_cost' => (string) $totalCost];
    }

    /** @return array{unit_cost:string, total_cost:string} */
    public function issue(array $data): array
    {
        $this->assertSaleable($data);

        $cost = $this->costs->issue(
            (int) $data['company_id'],
            (int) $data['item_id'],
            $data['qty_base'],
            $data['doc_type'],
            (int) $data['doc_id'],
        );

        $this->ledger->record(array_merge($data, [
            'direction' => 'out',
            'unit_cost' => $cost['unit_cost'],
        ]));

        return ['unit_cost' => $cost['unit_cost'], 'total_cost' => $cost['total_cost']];
    }

    /**
     * إخراج بتكلفة محددة مسبقًا (مثلاً بيع من مخزون سيارة حُمّل بتكلفة معروفة،
     * أو إلغاء حركة بنفس تكلفتها الأصلية).
     */
    public function issueAtCost(array $data, mixed $unitCost): array
    {
        $qty = Dec::round($data['qty_base'], Dec::SCALE_QTY);
        $unit = Dec::round($unitCost, Dec::SCALE_COST);
        $total = Dec::round(Dec::mul($qty, $unit), Dec::SCALE_MONEY);

        $this->costs->issue(
            (int) $data['company_id'],
            (int) $data['item_id'],
            $qty,
            $data['doc_type'],
            (int) $data['doc_id'],
        );

        $this->ledger->record(array_merge($data, [
            'direction' => 'out',
            'unit_cost' => (string) $unit,
        ]));

        return ['unit_cost' => (string) $unit, 'total_cost' => (string) $total];
    }

    /**
     * التحويل الداخلي: خروج من مخزن ودخول لآخر بنفس التكلفة.
     * لا يمر على محرك التكلفة لأن إجمالي الشركة لم يتغيّر.
     *
     * @return array{unit_cost:string, total_cost:string}
     */
    public function transfer(array $data, int $fromWarehouseId, int $toWarehouseId, ?string $unitCost = null, string $toBucket = StockLedger::BUCKET_AVAILABLE): array
    {
        $unit = $unitCost !== null
            ? Dec::round($unitCost, Dec::SCALE_COST)
            : Dec::round($this->costs->currentAverage((int) $data['company_id'], (int) $data['item_id']), Dec::SCALE_COST);

        $this->ledger->record(array_merge($data, [
            'warehouse_id' => $fromWarehouseId,
            'direction' => 'out',
            'unit_cost' => (string) $unit,
        ]));

        $this->ledger->record(array_merge($data, [
            'warehouse_id' => $toWarehouseId,
            'direction' => 'in',
            'unit_cost' => (string) $unit,
            'status_bucket' => $toBucket,
        ]));

        return [
            'unit_cost' => (string) $unit,
            'total_cost' => (string) Dec::round(Dec::mul($data['qty_base'], $unit), Dec::SCALE_MONEY),
        ];
    }

    /** مرتجع عميل — يعود بتكلفة البيع الأصلية المحفوظة في سطر الفاتورة. */
    public function returnIn(array $data, mixed $originalUnitCost): array
    {
        $qty = Dec::round($data['qty_base'], Dec::SCALE_QTY);
        $unit = Dec::round($originalUnitCost, Dec::SCALE_COST);
        $total = Dec::round(Dec::mul($qty, $unit), Dec::SCALE_MONEY);

        $this->ledger->record(array_merge($data, [
            'direction' => 'in',
            'unit_cost' => (string) $unit,
        ]));

        $this->costs->receive(
            (int) $data['company_id'],
            (int) $data['item_id'],
            $qty,
            $total,
            $data['doc_type'],
            (int) $data['doc_id'],
        );

        return ['unit_cost' => (string) $unit, 'total_cost' => (string) $total];
    }

    /**
     * يمنع البيع من رصيد غير قابل للبيع (تحت الفحص / حجر / تالف)
     * ومن الأصناف المنتهية أو القريبة من الانتهاء حسب سياسة الصنف.
     */
    private function assertSaleable(array $data): void
    {
        $bucket = $data['status_bucket'] ?? StockLedger::BUCKET_AVAILABLE;

        if (($data['enforce_sellable'] ?? true) && ! in_array($bucket, StockLedger::SELLABLE_BUCKETS, true)) {
            throw DomainException::make(
                'stock.not_sellable',
                'لا يُسمح بالبيع من رصيد غير صالح للبيع (تحت الفحص أو الحجر أو التالف).',
                ['status_bucket' => $bucket],
            );
        }

        if (! empty($data['batch_id']) && ($data['enforce_expiry'] ?? true)) {
            $item = Item::find($data['item_id']);
            $batch = \App\Models\StockBatch::find($data['batch_id']);

            if ($item?->track_expiry && $batch?->expiry_date) {
                $blockDays = (int) ($item->block_sale_days_before_expiry ?? 0);
                $threshold = now()->addDays($blockDays)->toDateString();

                if ($batch->expiry_date->toDateString() <= $threshold) {
                    throw DomainException::make(
                        'stock.expired',
                        "الدفعة {$batch->batch_no} تنتهي في {$batch->expiry_date->toDateString()} — البيع منها موقوف حسب سياسة الصنف.",
                        ['batch_id' => $batch->id, 'expiry_date' => $batch->expiry_date->toDateString()],
                    );
                }
            }
        }
    }
}
