<?php

namespace App\Domain\Support;

use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * Gap-free-ish document numbering per company, branch and document type.
 *
 * The series row is locked FOR UPDATE, so two concurrent postings cannot take
 * the same number. Numbers are allocated inside the caller's transaction; if
 * that transaction rolls back the number is released with it, which is the
 * behaviour an auditor expects for a document that was never issued.
 */
class DocumentNumbering
{
    public function next(string $docType, ?int $branchId = null, ?\DateTimeInterface $date = null): string
    {
        $companyId = CompanyContext::idOrFail();
        $date ??= now();

        return DB::transaction(function () use ($companyId, $docType, $branchId, $date) {
            $series = DB::table('number_series')
                ->where('company_id', $companyId)
                ->where('doc_type', $docType)
                ->where(fn ($q) => $branchId === null
                    ? $q->whereNull('branch_id')
                    : $q->where('branch_id', $branchId))
                ->lockForUpdate()
                ->first();

            if (! $series) {
                // Fall back to the company-wide series before creating one.
                $series = DB::table('number_series')
                    ->where('company_id', $companyId)
                    ->where('doc_type', $docType)
                    ->whereNull('branch_id')
                    ->lockForUpdate()
                    ->first();
            }

            if (! $series) {
                $id = DB::table('number_series')->insertGetId([
                    'company_id' => $companyId,
                    'branch_id' => $branchId,
                    'doc_type' => $docType,
                    'prefix' => $this->defaultPrefix($docType),
                    'suffix' => '',
                    'next_number' => 1,
                    'padding' => 6,
                    'reset_period' => 'yearly',
                    'current_period' => $date->format('Y'),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $series = DB::table('number_series')->where('id', $id)->lockForUpdate()->first();
            }

            $period = match ($series->reset_period) {
                'yearly' => $date->format('Y'),
                'monthly' => $date->format('Y-m'),
                default => null,
            };

            $number = $series->next_number;
            if ($period !== null && $series->current_period !== $period) {
                $number = 1;
            }

            DB::table('number_series')->where('id', $series->id)->update([
                'next_number' => $number + 1,
                'current_period' => $period,
                'updated_at' => now(),
            ]);

            $parts = array_filter([
                $series->prefix,
                $period,
                str_pad((string) $number, $series->padding, '0', STR_PAD_LEFT),
                $series->suffix,
            ], fn ($p) => $p !== null && $p !== '');

            return implode('-', $parts);
        });
    }

    protected function defaultPrefix(string $docType): string
    {
        return strtoupper(collect(explode('_', $docType))
            ->map(fn ($w) => substr($w, 0, 2))
            ->implode(''));
    }
}
