<?php

namespace App\Domain\Field;

use App\Domain\Shared\DomainException;
use App\Models\CommissionEntry;
use App\Models\CommissionRule;
use App\Models\SalesInvoice;
use App\Models\SalesReturn;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * العمولات.
 *
 * - تُحفظ نسخة القاعدة وإصدارها وتاريخ سريانها مع كل حركة عمولة.
 * - الأساس معلن صراحةً: صافي مبيعات / تحصيلات / ربح محقق.
 * - العمولة المقدرة (estimated) منفصلة عن المستحقة للصرف (earned).
 * - المرتجع والإلغاء والسداد الجزئي تُعالج بحركة تسوية عكسية، لا بإعادة حساب صامت.
 * - لا يُعاد حساب فترة مقفلة بقواعد جديدة إلا بتسوية معتمدة.
 */
class CommissionService
{
    /** احتساب عمولة فاتورة بيع. */
    public function accrueForInvoice(SalesInvoice $invoice): array
    {
        if (! $invoice->salesman_id) {
            return [];
        }

        $rules = $this->applicableRules(
            (int) $invoice->company_id,
            (int) $invoice->salesman_id,
            $invoice->invoice_date->toDateString(),
            'sales',
        );

        $entries = [];

        foreach ($rules as $rule) {
            $base = $this->baseAmount($rule, $invoice);

            if (Dec::isZero($base)) {
                continue;
            }

            $tier = $this->resolveTier($rule, $base, $invoice);

            if (! $tier) {
                continue;
            }

            $amount = Dec::add(
                Dec::round(Dec::div(Dec::mul($base, $tier->rate_pct), 100), Dec::SCALE_MONEY),
                $tier->fixed_amount,
            );

            // تقسيم العمولة دون تكرارها
            $amount = Dec::round(Dec::div(Dec::mul($amount, $rule->share_pct), 100), Dec::SCALE_MONEY);

            if (Dec::isZero($amount)) {
                continue;
            }

            $entries[] = CommissionEntry::updateOrCreate(
                [
                    'company_id' => $invoice->company_id,
                    'source_type' => 'sales_invoice',
                    'source_id' => $invoice->id,
                    'salesman_id' => $invoice->salesman_id,
                    'commission_rule_id' => $rule->id,
                ],
                [
                    'rule_version' => $rule->version,
                    'source_no' => $invoice->invoice_no,
                    'entry_date' => $invoice->invoice_date->toDateString(),
                    'base_amount' => Dec::money($base),
                    'rate_pct' => Dec::money($tier->rate_pct),
                    'amount' => Dec::money($amount),
                    // تُستحق فقط بعد التحصيل إذا كانت القاعدة تشترط ذلك
                    'status' => $rule->require_collection ? 'estimated' : 'earned',
                ],
            );
        }

        return $entries;
    }

    /**
     * تسوية العمولة بعد مرتجع — حركة عكسية موثقة تتتبع إلى المرتجع نفسه.
     */
    public function adjustForReturn(SalesReturn $return): array
    {
        if (! $return->salesman_id || ! $return->sales_invoice_id) {
            return [];
        }

        $original = CommissionEntry::where('company_id', $return->company_id)
            ->where('source_type', 'sales_invoice')
            ->where('source_id', $return->sales_invoice_id)
            ->where('salesman_id', $return->salesman_id)
            ->get();

        if ($original->isEmpty()) {
            return [];
        }

        $invoice = $return->salesInvoice;
        $invoiceNet = Dec::sub(
            Dec::sub($invoice->subtotal, $invoice->line_discount_amount),
            $invoice->header_discount_amount,
        );

        if (Dec::isZero($invoiceNet)) {
            return [];
        }

        $returnNet = Dec::sub($return->subtotal, $return->discount_amount);
        $ratio = Dec::div($returnNet, $invoiceNet, Dec::SCALE_CALC);

        $adjustments = [];

        foreach ($original as $entry) {
            if (! $entry->rule?->deduct_returns) {
                continue;
            }

            $reversal = Dec::neg(Dec::round(Dec::mul($entry->amount, $ratio), Dec::SCALE_MONEY));

            if (Dec::isZero($reversal)) {
                continue;
            }

            $adjustments[] = CommissionEntry::updateOrCreate(
                [
                    'company_id' => $return->company_id,
                    'source_type' => 'sales_return',
                    'source_id' => $return->id,
                    'salesman_id' => $return->salesman_id,
                    'commission_rule_id' => $entry->commission_rule_id,
                ],
                [
                    'rule_version' => $entry->rule_version,
                    'source_no' => $return->return_no,
                    'entry_date' => $return->return_date->toDateString(),
                    'base_amount' => Dec::money(Dec::neg($returnNet)),
                    'rate_pct' => $entry->rate_pct,
                    'amount' => Dec::money($reversal),
                    'status' => $entry->status,
                ],
            );
        }

        return $adjustments;
    }

    /** ترقية العمولة المقدّرة إلى مستحقة عند تحصيل الفاتورة بالكامل. */
    public function markEarnedOnCollection(SalesInvoice $invoice): int
    {
        $outstanding = Dec::sub(Dec::sub($invoice->total_amount, $invoice->paid_amount), $invoice->returned_amount);

        if (Dec::gt($outstanding, 0)) {
            return 0;
        }

        return CommissionEntry::where('company_id', $invoice->company_id)
            ->where('source_type', 'sales_invoice')
            ->where('source_id', $invoice->id)
            ->where('status', 'estimated')
            ->update(['status' => 'earned']);
    }

    /**
     * كشف عمولة يمكن تتبع كل مبلغ فيه إلى الفاتورة والتحصيل والقاعدة المستخدمة.
     */
    public function statement(int $companyId, int $salesmanId, string $from, string $to): array
    {
        $entries = CommissionEntry::with('rule')
            ->where('company_id', $companyId)
            ->where('salesman_id', $salesmanId)
            ->whereBetween('entry_date', [$from, $to])
            ->orderBy('entry_date')
            ->get();

        $estimated = Dec::of(0);
        $earned = Dec::of(0);
        $settled = Dec::of(0);

        foreach ($entries as $entry) {
            match ($entry->status) {
                'estimated' => $estimated = Dec::add($estimated, $entry->amount),
                'earned' => $earned = Dec::add($earned, $entry->amount),
                'settled' => $settled = Dec::add($settled, $entry->amount),
                default => null,
            };
        }

        return [
            'salesman_id' => $salesmanId,
            'period' => ['from' => $from, 'to' => $to],
            'totals' => [
                'estimated' => Dec::money($estimated),
                'earned' => Dec::money($earned),
                'settled' => Dec::money($settled),
                'payable_now' => Dec::money($earned),
            ],
            'lines' => $entries->map(fn (CommissionEntry $e) => [
                'entry_date' => $e->entry_date->toDateString(),
                'source_type' => $e->source_type,
                'source_id' => $e->source_id,
                'source_no' => $e->source_no,
                'rule' => $e->rule?->name,
                'rule_code' => $e->rule?->code,
                'rule_version' => $e->rule_version,
                'rule_base' => $e->rule?->base,
                'base_amount' => Dec::money($e->base_amount),
                'rate_pct' => Dec::money($e->rate_pct),
                'amount' => Dec::money($e->amount),
                'status' => $e->status,
            ])->all(),
        ];
    }

    /** @return \Illuminate\Support\Collection<int, CommissionRule> */
    private function applicableRules(int $companyId, int $salesmanId, string $date, string $roleType)
    {
        return CommissionRule::with('tiers')
            ->where('company_id', $companyId)
            ->where('is_active', true)
            ->where('role_type', $roleType)
            ->whereDate('valid_from', '<=', $date)
            ->where(fn ($q) => $q->whereNull('valid_to')->orWhereDate('valid_to', '>=', $date))
            ->where(fn ($q) => $q->whereNull('salesman_id')->orWhere('salesman_id', $salesmanId))
            ->get();
    }

    private function baseAmount(CommissionRule $rule, SalesInvoice $invoice): \Brick\Math\BigDecimal
    {
        $lines = $invoice->lines()
            ->when($rule->item_id, fn ($q) => $q->where('item_id', $rule->item_id))
            ->when($rule->category_id, fn ($q) => $q->whereIn('item_id', DB::table('items')->where('category_id', $rule->category_id)->pluck('id')))
            ->get();

        if ($rule->customer_id && (int) $invoice->customer_id !== (int) $rule->customer_id) {
            return Dec::of(0);
        }

        return match ($rule->base) {
            'net_sales' => Dec::sum($lines->map(fn ($l) => Dec::sub($l->line_total, $rule->exclude_tax ? 0 : Dec::neg($l->tax_amount)))),
            'realized_profit' => Dec::sum($lines->map(fn ($l) => Dec::sub($l->line_total, $l->total_cost))),
            'collections' => Dec::of($invoice->paid_amount),
            default => Dec::of(0),
        };
    }

    private function resolveTier(CommissionRule $rule, \Brick\Math\BigDecimal $base, SalesInvoice $invoice): ?object
    {
        $marginPct = Dec::isZero($invoice->subtotal)
            ? Dec::of(0)
            : Dec::mul(Dec::div(Dec::sub($invoice->total_amount, $invoice->total_cost), $invoice->total_amount), 100);

        foreach ($rule->tiers()->orderBy('from_amount')->get() as $tier) {
            $inRange = Dec::gte($base, $tier->from_amount)
                && ($tier->to_amount === null || Dec::lte($base, $tier->to_amount));

            $marginOk = $tier->min_margin_pct === null || Dec::gte($marginPct, $tier->min_margin_pct);

            if ($inRange && $marginOk) {
                return $tier;
            }
        }

        return null;
    }

    /** يمنع إعادة حساب فترة مقفلة بقواعد جديدة دون تسوية معتمدة. */
    public function assertPeriodOpen(int $companyId, string $date): void
    {
        $settled = DB::table('commission_settlements')
            ->where('company_id', $companyId)
            ->where('status', '!=', 'draft')
            ->whereDate('period_start', '<=', $date)
            ->whereDate('period_end', '>=', $date)
            ->exists();

        if ($settled) {
            throw DomainException::make(
                'commission.period_settled',
                "فترة العمولات التي تشمل {$date} مُسوّاة ومعتمدة. أي تعديل يحتاج تسوية معتمدة جديدة.",
            );
        }
    }
}
