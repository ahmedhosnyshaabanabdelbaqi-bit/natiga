<?php

namespace App\Domain\Credit;

use App\Domain\Shared\DomainException;
use App\Models\Customer;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * التعرض الائتماني ومراقبة الحد.
 *
 * التعرض = المستحقات المفوترة غير المسددة
 *        + الطلبات المعتمدة غير المفوترة (الجزء غير المفوتر فقط)
 *        + حصص الائتمان المحجوزة للأجهزة الأوفلاين (المتبقي منها فقط)
 * — دون عدّ مزدوج: الجزء المفوتر من الطلب يخرج من بند الطلبات،
 *   والجزء المستهلك من الحصة الأوفلاين يظهر كفاتورة.
 */
class CreditService
{
    /**
     * @return array{
     *   outstanding_invoices:string, approved_uninvoiced_orders:string,
     *   offline_reserved:string, total_exposure:string,
     *   credit_limit:string, available_credit:string, overdue_amount:string
     * }
     */
    public function exposure(int $companyId, int $customerId): array
    {
        $outstanding = DB::table('sales_invoices')
            ->where('company_id', $companyId)
            ->where('customer_id', $customerId)
            ->whereIn('status', ['posted', 'partially_paid'])
            ->selectRaw('COALESCE(SUM(total_amount - paid_amount - returned_amount), 0) AS balance')
            ->value('balance');

        // الجزء غير المفوتر من الطلبات المعتمدة فقط
        $uninvoicedOrders = DB::table('sales_orders as so')
            ->join('sales_order_lines as sol', 'sol.sales_order_id', '=', 'so.id')
            ->where('so.company_id', $companyId)
            ->where('so.customer_id', $customerId)
            ->where('so.payment_type', '!=', 'cash')
            ->whereIn('so.status', ['approved'])
            ->whereIn('so.invoice_status', ['pending', 'partial'])
            ->selectRaw("COALESCE(SUM(
                CASE WHEN sol.qty_base > 0
                     THEN (sol.line_total + sol.tax_amount) * ((sol.qty_base - sol.invoiced_qty_base) / sol.qty_base)
                     ELSE 0 END
            ), 0) AS balance")
            ->value('balance');

        $offlineReserved = DB::table('offline_credit_quotas')
            ->where('company_id', $companyId)
            ->where('customer_id', $customerId)
            ->where('status', 'active')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->selectRaw('COALESCE(SUM(GREATEST(amount - consumed_amount, 0)), 0) AS balance')
            ->value('balance');

        $overdue = DB::table('sales_invoices')
            ->where('company_id', $companyId)
            ->where('customer_id', $customerId)
            ->whereIn('status', ['posted', 'partially_paid'])
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<', now()->toDateString())
            ->selectRaw('COALESCE(SUM(total_amount - paid_amount - returned_amount), 0) AS balance')
            ->value('balance');

        $customer = Customer::findOrFail($customerId);
        $limit = Dec::of($customer->credit_limit);

        $total = Dec::add(Dec::add($outstanding, $uninvoicedOrders), $offlineReserved);

        return [
            'outstanding_invoices' => Dec::money($outstanding),
            'approved_uninvoiced_orders' => Dec::money($uninvoicedOrders),
            'offline_reserved' => Dec::money($offlineReserved),
            'total_exposure' => Dec::money($total),
            'credit_limit' => Dec::money($limit),
            'available_credit' => Dec::money(Dec::max(Dec::sub($limit, $total), 0)),
            'overdue_amount' => Dec::money($overdue),
        ];
    }

    /**
     * فحص قبل اعتماد مستند آجل. يرمي استثناءً ما لم تُمنح موافقة مسجلة.
     */
    public function assertCanSell(
        int $companyId,
        int $customerId,
        mixed $additionalAmount,
        bool $isCredit,
        bool $hasOverride = false,
        ?string $overrideReason = null,
    ): array {
        $customer = Customer::findOrFail($customerId);

        if ($customer->is_blocked && ! $hasOverride) {
            throw DomainException::make(
                'credit.customer_blocked',
                "العميل «{$customer->name}» موقوف: {$customer->block_reason}. البيع له يحتاج موافقة مسجلة.",
                ['customer_id' => $customerId],
            );
        }

        $exposure = $this->exposure($companyId, $customerId);

        if (! $isCredit) {
            return $exposure;
        }

        if (! $customer->credit_limit_enforced) {
            return $exposure;
        }

        $newExposure = Dec::add($exposure['total_exposure'], $additionalAmount);

        if (Dec::gt($newExposure, $exposure['credit_limit'])) {
            if (! $hasOverride) {
                throw DomainException::make(
                    'credit.limit_exceeded',
                    sprintf(
                        'تجاوز الحد الائتماني: الحد %s، التعرض الحالي %s، والمطلوب إضافته %s. يلزم موافقة مسجلة.',
                        $exposure['credit_limit'],
                        $exposure['total_exposure'],
                        Dec::money($additionalAmount),
                    ),
                    $exposure + ['requested' => Dec::money($additionalAmount)],
                );
            }

            if ($overrideReason === null || trim($overrideReason) === '') {
                throw DomainException::make(
                    'credit.override_reason_required',
                    'تجاوز الحد الائتماني يتطلب تسجيل سبب الموافقة.',
                );
            }
        }

        return $exposure;
    }

    /** كشف أعمار الديون حسب تاريخ الاستحقاق. */
    public function aging(int $companyId, ?int $customerId = null, ?string $asOf = null): array
    {
        $asOf = $asOf ?: now()->toDateString();

        $rows = DB::table('sales_invoices')
            ->where('company_id', $companyId)
            ->when($customerId !== null, fn ($q) => $q->where('customer_id', $customerId))
            ->whereIn('status', ['posted', 'partially_paid'])
            ->selectRaw('customer_id')
            ->selectRaw("COALESCE(SUM(CASE WHEN due_date IS NULL OR due_date >= ?::date THEN total_amount - paid_amount - returned_amount ELSE 0 END), 0) AS bucket_current", [$asOf])
            ->selectRaw("COALESCE(SUM(CASE WHEN due_date < ?::date AND due_date >= ?::date - INTERVAL '30 days' THEN total_amount - paid_amount - returned_amount ELSE 0 END), 0) AS bucket_1_30", [$asOf, $asOf])
            ->selectRaw("COALESCE(SUM(CASE WHEN due_date < ?::date - INTERVAL '30 days' AND due_date >= ?::date - INTERVAL '60 days' THEN total_amount - paid_amount - returned_amount ELSE 0 END), 0) AS bucket_31_60", [$asOf, $asOf])
            ->selectRaw("COALESCE(SUM(CASE WHEN due_date < ?::date - INTERVAL '60 days' AND due_date >= ?::date - INTERVAL '90 days' THEN total_amount - paid_amount - returned_amount ELSE 0 END), 0) AS bucket_61_90", [$asOf, $asOf])
            ->selectRaw("COALESCE(SUM(CASE WHEN due_date < ?::date - INTERVAL '90 days' THEN total_amount - paid_amount - returned_amount ELSE 0 END), 0) AS bucket_90_plus", [$asOf])
            ->groupBy('customer_id')
            ->havingRaw('SUM(total_amount - paid_amount - returned_amount) <> 0')
            ->get();

        return $rows->map(fn ($r) => [
            'customer_id' => (int) $r->customer_id,
            'current' => Dec::money($r->bucket_current),
            'days_1_30' => Dec::money($r->bucket_1_30),
            'days_31_60' => Dec::money($r->bucket_31_60),
            'days_61_90' => Dec::money($r->bucket_61_90),
            'days_90_plus' => Dec::money($r->bucket_90_plus),
            'total' => Dec::money(
                Dec::sum([$r->bucket_current, $r->bucket_1_30, $r->bucket_31_60, $r->bucket_61_90, $r->bucket_90_plus])
            ),
        ])->all();
    }
}
