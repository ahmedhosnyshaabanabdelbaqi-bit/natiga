<?php

namespace App\Domain\Pricing;

use App\Domain\Shared\DomainException;
use App\Models\Customer;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * محرك التسعير.
 *
 * أولوية تطبيق القواعد (من الأعلى للأدنى):
 *  1. سعر تعاقدي للعميل (customer_prices) مطابق للصنف والوحدة وشريحة الكمية وساري التاريخ.
 *  2. قائمة أسعار العميل (price_lists) بشريحة الكمية المناسبة.
 *  3. قائمة الأسعار الافتراضية للشركة.
 *
 * السعر المُعاد يُحفظ داخل المستند وقت الاعتماد ولا يتغيّر بتغيير القوائم لاحقًا.
 */
class PriceResolver
{
    /**
     * @return array{price:string, source:string, source_id:int|null, max_discount_pct:string, price_list_id:int|null}
     */
    public function resolve(
        int $companyId,
        int $itemId,
        int $uomId,
        mixed $qtyInUom,
        ?int $customerId = null,
        ?int $priceListId = null,
        ?string $date = null,
    ): array {
        $date = $date ?: now()->toDateString();
        $qty = Dec::of($qtyInUom);

        if ($customerId !== null) {
            $contract = DB::table('customer_prices')
                ->where('company_id', $companyId)
                ->where('customer_id', $customerId)
                ->where('item_id', $itemId)
                ->where('uom_id', $uomId)
                ->where('min_qty', '<=', (string) $qty)
                ->whereDate('valid_from', '<=', $date)
                ->where(fn ($q) => $q->whereNull('valid_to')->orWhereDate('valid_to', '>=', $date))
                ->orderByDesc('min_qty')
                ->first();

            if ($contract) {
                return [
                    'price' => Dec::money($contract->price),
                    'source' => 'customer_contract',
                    'source_id' => (int) $contract->id,
                    'max_discount_pct' => '0.0000',
                    'price_list_id' => null,
                ];
            }
        }

        $priceListId ??= $customerId !== null
            ? Customer::where('id', $customerId)->value('price_list_id')
            : null;

        $priceListId ??= DB::table('price_lists')
            ->where('company_id', $companyId)
            ->where('is_active', true)
            ->orderBy('priority')
            ->value('id');

        if ($priceListId === null) {
            throw DomainException::make(
                'pricing.no_price_list',
                'لا توجد قائمة أسعار نشطة. عرّف قائمة أسعار قبل إصدار المستندات.',
            );
        }

        $line = DB::table('price_list_lines')
            ->where('price_list_id', $priceListId)
            ->where('item_id', $itemId)
            ->where('uom_id', $uomId)
            ->where('min_qty', '<=', (string) $qty)
            ->whereDate('valid_from', '<=', $date)
            ->where(fn ($q) => $q->whereNull('valid_to')->orWhereDate('valid_to', '>=', $date))
            ->orderByDesc('min_qty')
            ->first();

        if (! $line) {
            throw DomainException::make(
                'pricing.price_not_found',
                "لا يوجد سعر سارٍ للصنف بهذه الوحدة في قائمة الأسعار بتاريخ {$date}.",
                ['item_id' => $itemId, 'uom_id' => $uomId, 'price_list_id' => $priceListId, 'date' => $date],
            );
        }

        return [
            'price' => Dec::money($line->price),
            'source' => 'price_list',
            'source_id' => (int) $line->id,
            'max_discount_pct' => Dec::money($line->max_discount_pct),
            'price_list_id' => (int) $priceListId,
        ];
    }

    /**
     * التحقق من أن الخصم المطلوب ضمن المسموح للمستخدم وقائمة الأسعار.
     */
    public function assertDiscountAllowed(mixed $discountPct, mixed $maxFromPriceList, mixed $maxForUser, bool $hasOverridePermission): void
    {
        $discount = Dec::of($discountPct);

        if ($discount->isZero()) {
            return;
        }

        if ($hasOverridePermission) {
            return;
        }

        $limit = Dec::max($maxFromPriceList, $maxForUser);

        if (Dec::gt($discount, $limit)) {
            throw DomainException::make(
                'pricing.discount_exceeded',
                "الخصم المطلوب {$discount}% يتجاوز الحد المسموح {$limit}%. يلزم موافقة مخوّل.",
                ['requested' => (string) $discount, 'limit' => (string) $limit],
            );
        }
    }
}
