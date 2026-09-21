<?php

namespace App\Domain\Field;

use App\Domain\Shared\AuditLogger;
use App\Domain\Shared\DocumentNumberService;
use App\Domain\Shared\DomainException;
use App\Models\DayClosure;
use App\Models\Salesman;
use App\Models\SyncOperation;
use App\Models\VarianceReport;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;

/**
 * إقفال يوم المندوب.
 *
 * معادلة البضاعة (بالقيمة):
 *   أول المدة + التحميل والتحويل الداخل + مرتجعات العملاء المستلمة
 *   − المبيعات المسلمة − البونص والهدايا − الرد للمخزن − التحويل الخارج
 *   − التالف المعتمد = الرصيد المتوقع
 *
 * معادلة النقدية:
 *   أول المدة + المقبوضات النقدية + العهد النقدية المستلمة
 *   − الإيداعات المعتمدة − المصروفات النقدية المعتمدة − المبالغ النقدية المردودة
 *   = النقدية المتوقعة
 *
 * التحويل المباشر للبنك والشيكات لا يضافان إلى النقدية الموجودة مع المندوب.
 * الإقفال النهائي يحتاج اكتمال المزامنة أو استثناءً موثقًا من مسؤول مختص.
 * العجز والزيادة يحتاجان محضرًا واعتمادًا ولا يُخصمان تلقائيًا من الراتب.
 */
class DayClosureService
{
    public function __construct(
        private readonly DocumentNumberService $numbers,
        private readonly AuditLogger $audit,
    ) {}

    public function openOrGet(int $companyId, int $salesmanId, string $date): DayClosure
    {
        $salesman = Salesman::findOrFail($salesmanId);

        return DayClosure::firstOrCreate(
            ['company_id' => $companyId, 'salesman_id' => $salesmanId, 'closure_date' => $date],
            [
                'branch_id' => $salesman->branch_id,
                'closure_no' => $this->numbers->next($companyId, 'day_closure', $salesman->branch_id, $date),
                'warehouse_id' => $salesman->warehouse_id,
                'cash_box_id' => $salesman->custody_cash_box_id,
                'status' => 'open',
            ],
        );
    }

    /** حساب الطرفين المتوقعين من دفاتر الحركة الفعلية. */
    public function calculate(DayClosure $closure): DayClosure
    {
        $companyId = (int) $closure->company_id;
        $date = $closure->closure_date->toDateString();
        $warehouseId = $closure->warehouse_id;
        $cashBoxId = $closure->cash_box_id;

        // ---------- معادلة البضاعة ----------
        if ($warehouseId) {
            $opening = $this->movementValue($companyId, $warehouseId, null, $date, before: true);

            $loadedIn = $this->movementValue($companyId, $warehouseId, ['stock_transfer_receive'], $date, direction: 'in');
            $returnsIn = $this->movementValue($companyId, $warehouseId, ['sales_return'], $date, direction: 'in');

            $sold = $this->soldValue($companyId, $warehouseId, $date, freeOnly: false);
            $bonus = $this->soldValue($companyId, $warehouseId, $date, freeOnly: true);
            $returnedToWh = $this->movementValue($companyId, $warehouseId, ['stock_transfer_send'], $date, direction: 'out');
            $damaged = $this->movementValue($companyId, $warehouseId, ['stock_adjustment'], $date, direction: 'out');

            $expectedGoods = Dec::sub(
                Dec::add(Dec::add($opening, $loadedIn), $returnsIn),
                Dec::add(Dec::add(Dec::add($sold, $bonus), $returnedToWh), $damaged),
            );

            $actualGoods = DB::table('stock_balances')
                ->where('company_id', $companyId)
                ->where('warehouse_id', $warehouseId)
                ->sum('total_value');

            $closure->fill([
                'goods_opening_value' => Dec::money($opening),
                'goods_loaded_value' => Dec::money($loadedIn),
                'goods_returns_in_value' => Dec::money($returnsIn),
                'goods_sold_value' => Dec::money($sold),
                'goods_bonus_value' => Dec::money($bonus),
                'goods_returned_to_wh_value' => Dec::money($returnedToWh),
                'goods_transfer_out_value' => '0.0000',
                'goods_damaged_value' => Dec::money($damaged),
                'goods_expected_value' => Dec::money($expectedGoods),
                'goods_actual_value' => Dec::money($actualGoods),
                'goods_variance_value' => Dec::money(Dec::sub($actualGoods, $expectedGoods)),
            ]);
        }

        // ---------- معادلة النقدية ----------
        if ($cashBoxId) {
            $cashOpening = $this->cashBoxBalance($companyId, (int) $cashBoxId, $date, before: true);

            $collected = DB::table('customer_receipts')
                ->where('company_id', $companyId)
                ->where('salesman_id', $closure->salesman_id)
                ->whereDate('receipt_date', $date)
                ->where('status', 'posted')
                ->where('payment_method', 'cash')
                ->sum('amount');

            // التحويل البنكي والشيكات لا يدخلان نقدية المندوب
            $bankTransfers = DB::table('customer_receipts')
                ->where('company_id', $companyId)
                ->where('salesman_id', $closure->salesman_id)
                ->whereDate('receipt_date', $date)
                ->where('status', 'posted')
                ->whereIn('payment_method', ['bank_transfer', 'card'])
                ->sum('amount');

            $cheques = DB::table('customer_receipts')
                ->where('company_id', $companyId)
                ->where('salesman_id', $closure->salesman_id)
                ->whereDate('receipt_date', $date)
                ->where('status', 'posted')
                ->where('payment_method', 'cheque')
                ->sum('amount');

            $deposited = DB::table('cash_deposits')
                ->where('company_id', $companyId)
                ->where('from_cash_box_id', $cashBoxId)
                ->whereDate('deposit_date', $date)
                ->where('status', 'posted')
                ->sum('amount');

            $expenses = DB::table('expenses')
                ->where('company_id', $companyId)
                ->where('cash_box_id', $cashBoxId)
                ->whereDate('expense_date', $date)
                ->where('status', 'posted')
                ->sum('amount');

            $refunds = DB::table('sales_returns')
                ->where('company_id', $companyId)
                ->where('salesman_id', $closure->salesman_id)
                ->whereDate('return_date', $date)
                ->where('status', 'posted')
                ->where('settlement_type', 'cash_refund')
                ->sum('total_amount');

            $expectedCash = Dec::sub(
                Dec::add($cashOpening, $collected),
                Dec::add(Dec::add($deposited, $expenses), $refunds),
            );

            $actualCash = $this->cashBoxBalance($companyId, (int) $cashBoxId, $date, before: false);

            $closure->fill([
                'cash_opening' => Dec::money($cashOpening),
                'cash_collected' => Dec::money($collected),
                'cash_custody_received' => '0.0000',
                'cash_deposited' => Dec::money($deposited),
                'cash_expenses' => Dec::money($expenses),
                'cash_refunds' => Dec::money($refunds),
                'cash_expected' => Dec::money($expectedCash),
                'cash_actual' => Dec::money($actualCash),
                'cash_variance' => Dec::money(Dec::sub($actualCash, $expectedCash)),
                'bank_transfers_amount' => Dec::money($bankTransfers),
                'cheques_amount' => Dec::money($cheques),
            ]);
        }

        // ---------- حالة المزامنة ----------
        $pending = SyncOperation::query()
            ->where('company_id', $companyId)
            ->whereIn('status', ['received', 'processing', 'conflict'])
            ->whereHas('device', fn ($q) => $q->where('salesman_id', $closure->salesman_id))
            ->count();

        $closure->pending_sync_ops = $pending;
        $closure->sync_complete = $pending === 0;
        $closure->save();

        return $closure->fresh();
    }

    /**
     * الإقفال النهائي. يُرفض إذا لم تكتمل المزامنة ما لم يُمنح استثناء موثق.
     * أي فرق يستلزم محضر عجز أو زيادة.
     */
    public function close(DayClosure $closure, ?int $userId, array $options = []): DayClosure
    {
        return DB::transaction(function () use ($closure, $userId, $options) {
            $closure = DayClosure::lockForUpdate()->findOrFail($closure->id);

            if ($closure->status === 'closed') {
                throw DomainException::make('closure.already_closed', "يوم المندوب {$closure->closure_date->toDateString()} مقفل بالفعل.");
            }

            $closure = $this->calculate($closure);

            if (isset($options['goods_actual_value'])) {
                $closure->goods_actual_value = Dec::money($options['goods_actual_value']);
                $closure->goods_variance_value = Dec::money(Dec::sub($closure->goods_actual_value, $closure->goods_expected_value));
            }

            if (isset($options['cash_actual'])) {
                $closure->cash_actual = Dec::money($options['cash_actual']);
                $closure->cash_variance = Dec::money(Dec::sub($closure->cash_actual, $closure->cash_expected));
            }

            if (! $closure->sync_complete) {
                if (empty($options['sync_exception_by'])) {
                    throw DomainException::make(
                        'closure.sync_incomplete',
                        "لا يمكن الإقفال النهائي قبل اكتمال مزامنة العمليات ({$closure->pending_sync_ops} عملية معلقة). يلزم استثناء موثق من مسؤول مختص.",
                        ['pending_sync_ops' => $closure->pending_sync_ops],
                    );
                }

                if (empty($options['sync_exception_reason'])) {
                    throw DomainException::make('closure.exception_reason_required', 'استثناء المزامنة يتطلب تسجيل السبب.');
                }

                $closure->sync_exception_granted = true;
                $closure->sync_exception_by = $options['sync_exception_by'];
                $closure->sync_exception_reason = $options['sync_exception_reason'];
            }

            // العجز والزيادة: محضر يحتاج اعتمادًا، ولا خصم تلقائي من الراتب
            foreach ([['cash', $closure->cash_variance], ['goods', $closure->goods_variance_value]] as [$type, $variance]) {
                if (Dec::isZero($variance)) {
                    continue;
                }

                VarianceReport::firstOrCreate(
                    ['company_id' => $closure->company_id, 'day_closure_id' => $closure->id, 'variance_type' => $type],
                    [
                        'report_no' => $this->numbers->next((int) $closure->company_id, 'variance_report', $closure->branch_id, $closure->closure_date->toDateString()),
                        'amount' => Dec::money(Dec::abs($variance)),
                        'direction' => Dec::isNegative($variance) ? 'shortage' : 'excess',
                        'status' => 'pending',
                        'explanation' => $options['variance_explanation'] ?? null,
                        'created_by' => $userId,
                    ],
                );
            }

            $closure->status = 'closed';
            $closure->closed_by = $userId;
            $closure->closed_at = now();
            $closure->save();

            $this->audit->log('close', 'day_closure', (int) $closure->id, $closure->closure_no, null, [
                'cash_variance' => $closure->cash_variance,
                'goods_variance' => $closure->goods_variance_value,
                'sync_exception' => $closure->sync_exception_granted,
            ], companyId: (int) $closure->company_id);

            return $closure;
        });
    }

    /** إعادة فتح يوم مقفل — تتطلب صلاحية وسببًا وسجل مراجعة. */
    public function reopen(DayClosure $closure, int $userId, string $reason): DayClosure
    {
        if (trim($reason) === '') {
            throw DomainException::make('closure.reopen_reason_required', 'إعادة فتح يوم مقفل تتطلب تسجيل السبب.');
        }

        if ($closure->status !== 'closed') {
            throw DomainException::make('closure.not_closed', 'اليوم ليس مقفلًا.');
        }

        $before = $closure->only(['status', 'closed_by', 'closed_at']);

        $closure->status = 'reopened';
        $closure->reopened_by = $userId;
        $closure->reopened_at = now();
        $closure->reopen_reason = $reason;
        $closure->save();

        $this->audit->log('reopen', 'day_closure', (int) $closure->id, $closure->closure_no, $before, [
            'status' => 'reopened',
        ], $reason, (int) $closure->company_id);

        return $closure;
    }

    // ---------- أدوات الحساب ----------

    private function movementValue(int $companyId, int $warehouseId, ?array $docTypes, string $date, ?string $direction = null, bool $before = false): \Brick\Math\BigDecimal
    {
        $query = DB::table('stock_movements')
            ->where('company_id', $companyId)
            ->where('warehouse_id', $warehouseId);

        if ($before) {
            $query->whereDate('movement_date', '<', $date);

            return Dec::of(
                $query->selectRaw("COALESCE(SUM(CASE WHEN direction = 'in' THEN total_cost ELSE -total_cost END), 0) AS v")->value('v')
            );
        }

        $query->whereDate('movement_date', $date);

        if ($docTypes !== null) {
            $query->whereIn('doc_type', $docTypes);
        }

        if ($direction !== null) {
            $query->where('direction', $direction);
        }

        return Dec::of($query->sum('total_cost'));
    }

    private function soldValue(int $companyId, int $warehouseId, string $date, bool $freeOnly): \Brick\Math\BigDecimal
    {
        return Dec::of(
            DB::table('sales_invoice_lines as sil')
                ->join('sales_invoices as si', 'si.id', '=', 'sil.sales_invoice_id')
                ->where('si.company_id', $companyId)
                ->where('si.warehouse_id', $warehouseId)
                ->whereDate('si.invoice_date', $date)
                ->where('si.status', '!=', 'cancelled')
                ->where('sil.is_free', $freeOnly)
                ->sum('sil.total_cost')
        );
    }

    private function cashBoxBalance(int $companyId, int $cashBoxId, string $date, bool $before): \Brick\Math\BigDecimal
    {
        $accountId = DB::table('cash_boxes')->where('id', $cashBoxId)->value('account_id');

        $row = DB::table('journal_lines')
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_lines.journal_entry_id')
            ->where('journal_entries.company_id', $companyId)
            ->where('journal_entries.status', 'posted')
            ->where('journal_lines.account_id', $accountId)
            ->when($before, fn ($q) => $q->whereDate('journal_entries.entry_date', '<', $date))
            ->when(! $before, fn ($q) => $q->whereDate('journal_entries.entry_date', '<=', $date))
            ->selectRaw('COALESCE(SUM(debit), 0) AS d, COALESCE(SUM(credit), 0) AS c')
            ->first();

        return Dec::sub($row->d, $row->c);
    }
}
