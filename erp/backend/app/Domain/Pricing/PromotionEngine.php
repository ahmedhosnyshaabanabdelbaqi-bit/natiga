<?php

namespace App\Domain\Pricing;

use App\Domain\Shared\DomainException;
use App\Models\Promotion;
use App\Support\Dec;

/**
 * محرك العروض: البونص والهدايا وشراء كمية والحصول على كمية إضافية.
 *
 * الكميات المجانية تُخصم فعليًا من المخزون وتُثبت تكلفتها (is_free على السطر بسعر صفر).
 * العروض غير القابلة للتجميع لا تُطبَّق مع غيرها على نفس السطر.
 */
class PromotionEngine
{
    /**
     * @param  array<int, array{item_id:int, uom_id:int, qty_uom:mixed, unit_price:mixed, category_id?:int|null}>  $lines
     * @return array<int, array{item_id:int, uom_id:int, qty_uom:string, promotion_id:int, kind:string, value:string}>
     */
    public function evaluate(int $companyId, array $lines, ?string $date = null, array $context = []): array
    {
        $date = $date ?: now()->toDateString();

        $promotions = Promotion::query()
            ->where('company_id', $companyId)
            ->where('is_active', true)
            ->whereDate('valid_from', '<=', $date)
            ->where(fn ($q) => $q->whereNull('valid_to')->orWhereDate('valid_to', '>=', $date))
            ->orderBy('priority')
            ->with('lines')
            ->get();

        $results = [];
        $appliedNonStackable = [];

        foreach ($promotions as $promotion) {
            if (! $this->matchesContext($promotion, $context)) {
                continue;
            }

            foreach ($lines as $index => $line) {
                if (isset($appliedNonStackable[$index])) {
                    continue;
                }

                foreach ($promotion->lines as $rule) {
                    $matchesItem = $rule->item_id !== null && (int) $rule->item_id === (int) $line['item_id'];
                    $matchesCategory = $rule->category_id !== null
                        && isset($line['category_id'])
                        && (int) $rule->category_id === (int) $line['category_id'];

                    if (! $matchesItem && ! $matchesCategory) {
                        continue;
                    }

                    if ($promotion->type === 'buy_x_get_y') {
                        if (! Dec::isPositive($rule->buy_qty)) {
                            continue;
                        }
                        $times = Dec::of($line['qty_uom'])->dividedBy(Dec::of($rule->buy_qty), 0, \Brick\Math\RoundingMode::Down);
                        if (! $times->isPositive()) {
                            continue;
                        }
                        $freeQty = Dec::mul($times, $rule->free_qty);
                        if (! $freeQty->isPositive()) {
                            continue;
                        }

                        $results[] = [
                            'source_line_index' => $index,
                            'item_id' => (int) ($rule->free_item_id ?? $line['item_id']),
                            'uom_id' => (int) ($rule->free_uom_id ?? $line['uom_id']),
                            'qty_uom' => Dec::qty($freeQty),
                            'promotion_id' => (int) $promotion->id,
                            'kind' => 'free_qty',
                            'value' => Dec::qty($freeQty),
                        ];
                    } elseif ($promotion->type === 'line_discount_pct' && Dec::isPositive($rule->discount_pct)) {
                        $results[] = [
                            'source_line_index' => $index,
                            'item_id' => (int) $line['item_id'],
                            'uom_id' => (int) $line['uom_id'],
                            'qty_uom' => Dec::qty($line['qty_uom']),
                            'promotion_id' => (int) $promotion->id,
                            'kind' => 'discount_pct',
                            'value' => Dec::money($rule->discount_pct),
                        ];
                    }

                    if (! $promotion->stackable) {
                        $appliedNonStackable[$index] = true;
                    }

                    break;
                }
            }
        }

        return $results;
    }

    /** أثر العرض على هامش الربح — يُعرض للمخوّل بمشاهدة التكلفة فقط. */
    public function marginImpact(mixed $revenue, mixed $cost): array
    {
        $margin = Dec::sub($revenue, $cost);
        $pct = Dec::isZero($revenue) ? Dec::of(0) : Dec::mul(Dec::div($margin, $revenue), 100);

        return [
            'margin_amount' => Dec::money($margin),
            'margin_pct' => Dec::money($pct),
        ];
    }

    private function matchesContext(Promotion $promotion, array $context): bool
    {
        $conditions = $promotion->conditions ?? [];

        foreach (['price_list_id' => 'price_list_ids', 'customer_type' => 'customer_types', 'region_id' => 'region_ids'] as $ctxKey => $condKey) {
            if (! empty($conditions[$condKey]) && isset($context[$ctxKey])) {
                if (! in_array($context[$ctxKey], $conditions[$condKey], false)) {
                    return false;
                }
            }
        }

        return true;
    }
}
