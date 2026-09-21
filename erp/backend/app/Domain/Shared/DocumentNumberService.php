<?php

namespace App\Domain\Shared;

use App\Models\DocumentSequence;
use Illuminate\Support\Facades\DB;

/**
 * ترقيم المستندات — تسلسل محجوز بقفل صف داخل المعاملة، لا يُنتج أرقامًا مكررة تحت التزامن.
 */
class DocumentNumberService
{
    public function next(int $companyId, string $docType, ?int $branchId = null, ?string $date = null): string
    {
        $date = $date ?: now()->toDateString();

        $sequence = DocumentSequence::query()
            ->where('company_id', $companyId)
            ->where('doc_type', $docType)
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->when($branchId === null, fn ($q) => $q->whereNull('branch_id'))
            ->lockForUpdate()
            ->first();

        if (! $sequence) {
            // إنشاء آمن تحت التزامن: أول من ينجح يملك التسلسل
            DB::table('document_sequences')->insertOrIgnore([
                'company_id' => $companyId,
                'branch_id' => $branchId,
                'doc_type' => $docType,
                'prefix' => $this->defaultPrefix($docType),
                'next_no' => 1,
                'padding' => 6,
                'reset_period' => 'yearly',
                'period_key' => substr($date, 0, 4),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $sequence = DocumentSequence::query()
                ->where('company_id', $companyId)
                ->where('doc_type', $docType)
                ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
                ->when($branchId === null, fn ($q) => $q->whereNull('branch_id'))
                ->lockForUpdate()
                ->firstOrFail();
        }

        $periodKey = match ($sequence->reset_period) {
            'yearly' => substr($date, 0, 4),
            'monthly' => substr($date, 0, 7),
            default => null,
        };

        if ($periodKey !== null && $sequence->period_key !== $periodKey) {
            $sequence->next_no = 1;
            $sequence->period_key = $periodKey;
        }

        $number = (int) $sequence->next_no;
        $sequence->next_no = $number + 1;
        $sequence->save();

        $parts = array_filter([
            $sequence->prefix,
            $periodKey !== null ? str_replace('-', '', $periodKey) : null,
            str_pad((string) $number, (int) $sequence->padding, '0', STR_PAD_LEFT),
        ]);

        return implode('-', $parts);
    }

    private function defaultPrefix(string $docType): string
    {
        return match ($docType) {
            'purchase_order' => 'PO',
            'goods_receipt' => 'GRN',
            'supplier_invoice' => 'PINV',
            'purchase_return' => 'PRET',
            'supplier_payment' => 'PAY',
            'sales_order' => 'SO',
            'quotation' => 'QT',
            'delivery_note' => 'DN',
            'sales_invoice' => 'INV',
            'sales_return' => 'SRET',
            'customer_receipt' => 'RCT',
            'cash_deposit' => 'DEP',
            'expense' => 'EXP',
            'stock_transfer' => 'TRF',
            'stock_adjustment' => 'ADJ',
            'inventory_count' => 'CNT',
            'load_order' => 'LOD',
            'day_closure' => 'CLS',
            'variance_report' => 'VAR',
            'journal_entry' => 'JE',
            'custody_handover' => 'HND',
            'commission_settlement' => 'COM',
            'import_batch' => 'IMP',
            'customer_complaint' => 'CMP',
            default => strtoupper(substr($docType, 0, 3)),
        };
    }
}
