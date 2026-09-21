<?php

namespace App\Domain\Inventory;

use App\Domain\Shared\DomainException;
use App\Support\Dec;
use Brick\Math\BigDecimal;
use Illuminate\Support\Facades\DB;

/**
 * محرك التكلفة — المتوسط المرجح المتحرك (Moving Weighted Average) على مستوى (الشركة × الصنف).
 *
 * قواعد ثابتة:
 *  - تكلفة الإخراج تُحسب بالمتوسط السائد لحظة الحركة وتُحفظ في المستند؛ لا يُعاد حسابها لاحقًا.
 *  - التحويل الداخلي بين المخازن لا يغيّر المتوسط ولا ينشئ ربحًا.
 *  - المرتجع يعود بتكلفة البيع الأصلية المحفوظة في سطر الفاتورة.
 *  - FIFO غير مفعّل: تغيير طريقة التقييم يحتاج إجراء انتقال معتمدًا.
 */
class CostEngine
{
    /** قفل صف التكلفة ثم إرجاعه — يمنع سباق تحديث المتوسط. */
    private function lockRow(int $companyId, int $itemId): object
    {
        DB::table('item_costs')->insertOrIgnore([
            'company_id' => $companyId,
            'item_id' => $itemId,
            'qty_on_hand' => '0',
            'total_value' => '0',
            'avg_cost' => '0',
            'method' => 'moving_average',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $row = DB::table('item_costs')
            ->where('company_id', $companyId)
            ->where('item_id', $itemId)
            ->lockForUpdate()
            ->first();

        if (! $row) {
            throw DomainException::make('cost.row_missing', "تعذّر تهيئة سجل تكلفة الصنف #{$itemId}.");
        }

        return $row;
    }

    private function persist(int $companyId, int $itemId, object $row, BigDecimal $qtyAfter, BigDecimal $valueAfter, string $docType, int $docId, BigDecimal $qtyChange, BigDecimal $valueChange): string
    {
        // عند تصفير الكمية يُصفَّر الرصيد القيمي حتى لا يتراكم انحراف كسور
        if ($qtyAfter->isZero()) {
            $valueAfter = BigDecimal::zero();
        }

        $avgAfter = $qtyAfter->isZero()
            ? Dec::of($row->avg_cost)
            : Dec::round(Dec::div($valueAfter, $qtyAfter, Dec::SCALE_CALC), Dec::SCALE_COST);

        DB::table('item_costs')
            ->where('company_id', $companyId)
            ->where('item_id', $itemId)
            ->update([
                'qty_on_hand' => (string) Dec::round($qtyAfter, Dec::SCALE_QTY),
                'total_value' => (string) Dec::round($valueAfter, Dec::SCALE_MONEY),
                'avg_cost' => (string) $avgAfter,
                'updated_at' => now(),
            ]);

        DB::table('item_cost_history')->insert([
            'company_id' => $companyId,
            'item_id' => $itemId,
            'doc_type' => $docType,
            'doc_id' => $docId,
            'qty_change' => (string) Dec::round($qtyChange, Dec::SCALE_QTY),
            'value_change' => (string) Dec::round($valueChange, Dec::SCALE_MONEY),
            'qty_after' => (string) Dec::round($qtyAfter, Dec::SCALE_QTY),
            'value_after' => (string) Dec::round($valueAfter, Dec::SCALE_MONEY),
            'avg_cost_before' => (string) Dec::round($row->avg_cost, Dec::SCALE_COST),
            'avg_cost_after' => (string) $avgAfter,
            'created_at' => now(),
        ]);

        return (string) $avgAfter;
    }

    /**
     * إدخال بتكلفة معلومة (شراء / مرتجع / زيادة جرد).
     * يُرجع متوسط التكلفة بعد الحركة.
     */
    public function receive(int $companyId, int $itemId, mixed $qtyBase, mixed $totalValue, string $docType, int $docId): string
    {
        $qty = Dec::of($qtyBase);
        $value = Dec::of($totalValue);

        if (! $qty->isPositive()) {
            throw DomainException::make('cost.invalid_qty', 'كمية الإدخال يجب أن تكون موجبة.');
        }

        $row = $this->lockRow($companyId, $itemId);

        $qtyAfter = Dec::add($row->qty_on_hand, $qty);
        $valueAfter = Dec::add($row->total_value, $value);

        return $this->persist($companyId, $itemId, $row, $qtyAfter, $valueAfter, $docType, $docId, $qty, $value);
    }

    /**
     * إخراج بالمتوسط السائد. يُرجع ['unit_cost' => ..., 'total_cost' => ...].
     *
     * @return array{unit_cost:string, total_cost:string, avg_after:string}
     */
    public function issue(int $companyId, int $itemId, mixed $qtyBase, string $docType, int $docId, bool $allowNegative = false): array
    {
        $qty = Dec::of($qtyBase);

        if (! $qty->isPositive()) {
            throw DomainException::make('cost.invalid_qty', 'كمية الإخراج يجب أن تكون موجبة.');
        }

        $row = $this->lockRow($companyId, $itemId);

        $qtyAfter = Dec::sub($row->qty_on_hand, $qty);

        if ($qtyAfter->isNegative() && ! $allowNegative) {
            throw DomainException::make(
                'cost.negative_stock',
                "الكمية المطلوبة ({$qty}) تتجاوز رصيد الشركة من الصنف (".Dec::qty($row->qty_on_hand).').',
                ['item_id' => $itemId, 'available' => (string) $row->qty_on_hand],
            );
        }

        $unitCost = Dec::round($row->avg_cost, Dec::SCALE_COST);
        $totalCost = Dec::round(Dec::mul($qty, $unitCost), Dec::SCALE_MONEY);
        $valueAfter = Dec::sub($row->total_value, $totalCost);

        $avgAfter = $this->persist($companyId, $itemId, $row, $qtyAfter, $valueAfter, $docType, $docId, Dec::neg($qty), Dec::neg($totalCost));

        return [
            'unit_cost' => (string) $unitCost,
            'total_cost' => (string) $totalCost,
            'avg_after' => $avgAfter,
        ];
    }

    /** إدخال بتكلفة محددة صراحةً (مرتجع بتكلفة البيع الأصلية). */
    public function receiveAtCost(int $companyId, int $itemId, mixed $qtyBase, mixed $unitCost, string $docType, int $docId): string
    {
        $total = Dec::round(Dec::mul($qtyBase, $unitCost), Dec::SCALE_MONEY);

        return $this->receive($companyId, $itemId, $qtyBase, $total, $docType, $docId);
    }

    /** المتوسط الحالي دون قفل — للعرض والتقدير فقط، لا للترحيل. */
    public function currentAverage(int $companyId, int $itemId): string
    {
        $row = DB::table('item_costs')
            ->where('company_id', $companyId)
            ->where('item_id', $itemId)
            ->first();

        return $row ? (string) Dec::round($row->avg_cost, Dec::SCALE_COST) : '0.000000';
    }

    /** تعديل قيمة المخزون دون تغيير الكمية (تكاليف إضافية لاحقة). */
    public function adjustValue(int $companyId, int $itemId, mixed $valueChange, string $docType, int $docId): string
    {
        $row = $this->lockRow($companyId, $itemId);

        $qtyAfter = Dec::of($row->qty_on_hand);
        $valueAfter = Dec::add($row->total_value, $valueChange);

        return $this->persist($companyId, $itemId, $row, $qtyAfter, $valueAfter, $docType, $docId, BigDecimal::zero(), Dec::of($valueChange));
    }
}
