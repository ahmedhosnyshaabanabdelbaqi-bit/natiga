<?php

namespace App\Domain\Credit;

use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Models\CreditReservation;
use App\Models\Customer;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * Credit exposure and limit enforcement.
 *
 * Exposure is deliberately broader than "unpaid invoices". It is:
 *
 *   posted invoices outstanding
 * + approved orders not yet invoiced          (goods promised, money not billed)
 * + active offline credit reservations        (headroom handed to a device)
 * − unallocated receipts                      (money in, not yet matched)
 *
 * The offline reservation is counted here and nowhere else, so a slice handed
 * to a rep's tablet is invisible to every other channel — that is what stops
 * two reps spending the same headroom — and is not double-counted once the
 * order it backs arrives, because consuming a reservation releases it.
 */
class CreditService
{
    /** @return array{outstanding: string, undelivered_orders: string, offline_reserved: string, unallocated_receipts: string, exposure: string, limit: string, headroom: string} */
    public function exposure(Customer $customer): array
    {
        $companyId = CompanyContext::idOrFail();

        $outstanding = DB::table('sales_invoices')
            ->where('company_id', $companyId)
            ->where('customer_id', $customer->id)
            ->where('status', 'posted')
            ->selectRaw('COALESCE(SUM(total - paid_amount - returned_amount), 0) AS v')
            ->value('v');

        // Approved orders, valued at the part not yet invoiced.
        $undelivered = DB::table('sales_orders as so')
            ->join('sales_order_lines as sol', 'sol.sales_order_id', '=', 'so.id')
            ->where('so.company_id', $companyId)
            ->where('so.customer_id', $customer->id)
            ->where('so.payment_type', '<>', 'cash')
            ->whereIn('so.status', ['approved', 'partially_delivered'])
            ->whereIn('so.invoice_status', ['pending', 'partial'])
            ->selectRaw('COALESCE(SUM(
                CASE WHEN sol.qty_base > 0
                     THEN sol.line_total * ((sol.qty_base - sol.qty_invoiced_base) / sol.qty_base)
                     ELSE 0 END), 0) AS v')
            ->value('v');

        $offlineReserved = DB::table('credit_reservations')
            ->where('company_id', $companyId)
            ->where('customer_id', $customer->id)
            ->where('status', 'active')
            ->where('expires_at', '>', now())
            ->selectRaw('COALESCE(SUM(amount - consumed_amount), 0) AS v')
            ->value('v');

        $unallocated = DB::table('receipts')
            ->where('company_id', $companyId)
            ->where('customer_id', $customer->id)
            ->where('status', 'posted')
            ->selectRaw('COALESCE(SUM(amount - allocated_amount), 0) AS v')
            ->value('v');

        $exposure = Num::money(Num::sub(
            Num::add(Num::add($outstanding, $undelivered, Num::MONEY_SCALE), $offlineReserved, Num::MONEY_SCALE),
            $unallocated,
            Num::MONEY_SCALE
        ));

        $limit = Num::money($customer->credit_limit);

        return [
            'outstanding' => Num::money($outstanding),
            'undelivered_orders' => Num::money($undelivered),
            'offline_reserved' => Num::money($offlineReserved),
            'unallocated_receipts' => Num::money($unallocated),
            'exposure' => $exposure,
            'limit' => $limit,
            'headroom' => Num::money(Num::sub($limit, $exposure, Num::MONEY_SCALE)),
        ];
    }

    /**
     * Decide whether a credit sale of `amount` may proceed.
     *
     * Returns the reason it cannot rather than throwing, because the caller
     * sometimes has an approval to apply instead.
     *
     * @return array{allowed: bool, reason: string|null, message: string|null, exposure: array}
     */
    public function check(Customer $customer, string $amount): array
    {
        $exposure = $this->exposure($customer);

        if ($customer->credit_hold) {
            return [
                'allowed' => false,
                'reason' => 'credit.customer_on_hold',
                'message' => "العميل «{$customer->name}» موقوف عن البيع الآجل ويحتاج موافقة مسجلة.",
                'exposure' => $exposure,
            ];
        }

        if ($customer->is_cash_only) {
            return [
                'allowed' => false,
                'reason' => 'credit.cash_only_customer',
                'message' => "العميل «{$customer->name}» نقدي فقط.",
                'exposure' => $exposure,
            ];
        }

        // A zero limit means no credit was granted, not unlimited credit.
        if (Num::cmp($amount, $exposure['headroom'], Num::MONEY_SCALE) > 0) {
            return [
                'allowed' => false,
                'reason' => 'credit.limit_exceeded',
                'message' => sprintf(
                    'تجاوز الحد الائتماني للعميل «%s»: الحد %s، التعرض الحالي %s، المتاح %s، المطلوب %s.',
                    $customer->name, $exposure['limit'], $exposure['exposure'],
                    $exposure['headroom'], Num::money($amount)
                ),
                'exposure' => $exposure,
            ];
        }

        return ['allowed' => true, 'reason' => null, 'message' => null, 'exposure' => $exposure];
    }

    /** Same check, but refusing outright. Used where no override path exists. */
    public function assert(Customer $customer, string $amount): void
    {
        $result = $this->check($customer, $amount);

        if (! $result['allowed']) {
            throw DomainException::make($result['reason'], $result['message'], $result['exposure']);
        }
    }

    /**
     * Carve out headroom for one device to spend while offline.
     *
     * The slice counts inside central exposure from this moment, so the office
     * cannot sell it again. It expires on its own; nothing has to remember to
     * clean it up for the limit to be correct.
     */
    public function reserveForDevice(
        Customer $customer,
        int $deviceId,
        int $repId,
        string $amount,
        \DateTimeInterface $expiresAt,
    ): CreditReservation {
        return DB::transaction(function () use ($customer, $deviceId, $repId, $amount, $expiresAt) {
            // Lock the customer row so two concurrent grants cannot both fit.
            DB::table('customers')->where('id', $customer->id)->lockForUpdate()->first();

            $this->assert($customer, $amount);

            return CreditReservation::create([
                'company_id' => CompanyContext::idOrFail(),
                'customer_id' => $customer->id,
                'device_id' => $deviceId,
                'rep_id' => $repId,
                'amount' => Num::money($amount),
                'consumed_amount' => '0',
                'expires_at' => $expiresAt,
                'status' => 'active',
                'created_by' => auth()->id(),
            ]);
        });
    }

    /**
     * Spend against a device's slice when its offline order finally syncs.
     *
     * Returns what the slice covered. Anything beyond it is the caller's problem
     * to route through the normal credit check or an approval.
     */
    public function consumeDeviceReservation(Customer $customer, int $deviceId, string $amount): string
    {
        $remaining = Num::money($amount);
        $consumed = '0';

        $reservations = CreditReservation::query()
            ->where('customer_id', $customer->id)
            ->where('device_id', $deviceId)
            ->where('status', 'active')
            ->orderBy('expires_at')
            ->lockForUpdate()
            ->get();

        foreach ($reservations as $reservation) {
            if (! Num::isPositive($remaining, Num::MONEY_SCALE)) {
                break;
            }

            $free = Num::sub($reservation->amount, $reservation->consumed_amount, Num::MONEY_SCALE);
            $take = Num::min($free, $remaining);

            if (! Num::isPositive($take, Num::MONEY_SCALE)) {
                continue;
            }

            $newConsumed = Num::money(Num::add($reservation->consumed_amount, $take, Num::MONEY_SCALE));
            $reservation->forceFill([
                'consumed_amount' => $newConsumed,
                'status' => Num::cmp($newConsumed, $reservation->amount, Num::MONEY_SCALE) >= 0
                    ? 'consumed' : 'active',
            ])->save();

            $consumed = Num::add($consumed, $take, Num::MONEY_SCALE);
            $remaining = Num::sub($remaining, $take, Num::MONEY_SCALE);
        }

        return Num::money($consumed);
    }

    public function releaseExpiredReservations(): int
    {
        return CreditReservation::query()
            ->where('status', 'active')
            ->where('expires_at', '<=', now())
            ->update(['status' => 'expired', 'updated_at' => now()]);
    }

    /** Aged receivables, bucketed by days past the invoice due date. */
    public function agingBuckets(?int $customerId = null, ?string $asOf = null): \Illuminate\Support\Collection
    {
        $asOf ??= now()->toDateString();

        $q = DB::table('sales_invoices as si')
            ->join('customers as c', 'c.id', '=', 'si.customer_id')
            ->where('si.company_id', CompanyContext::idOrFail())
            ->where('si.status', 'posted')
            ->whereRaw('si.total - si.paid_amount - si.returned_amount > 0')
            ->where('si.invoice_date', '<=', $asOf)
            ->groupBy('c.id', 'c.code', 'c.name')
            ->selectRaw("
                c.id AS customer_id, c.code, c.name,
                SUM(si.total - si.paid_amount - si.returned_amount) AS total,
                SUM(CASE WHEN COALESCE(si.due_date, si.invoice_date) >= ?::date
                         THEN si.total - si.paid_amount - si.returned_amount ELSE 0 END) AS not_due,
                SUM(CASE WHEN ?::date - COALESCE(si.due_date, si.invoice_date) BETWEEN 1 AND 30
                         THEN si.total - si.paid_amount - si.returned_amount ELSE 0 END) AS d1_30,
                SUM(CASE WHEN ?::date - COALESCE(si.due_date, si.invoice_date) BETWEEN 31 AND 60
                         THEN si.total - si.paid_amount - si.returned_amount ELSE 0 END) AS d31_60,
                SUM(CASE WHEN ?::date - COALESCE(si.due_date, si.invoice_date) BETWEEN 61 AND 90
                         THEN si.total - si.paid_amount - si.returned_amount ELSE 0 END) AS d61_90,
                SUM(CASE WHEN ?::date - COALESCE(si.due_date, si.invoice_date) > 90
                         THEN si.total - si.paid_amount - si.returned_amount ELSE 0 END) AS d90_plus
            ", array_fill(0, 5, $asOf))
            ->orderByDesc('total');

        if ($customerId) {
            $q->where('si.customer_id', $customerId);
        }

        return $q->get();
    }
}
