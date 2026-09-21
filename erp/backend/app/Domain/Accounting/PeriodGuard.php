<?php

namespace App\Domain\Accounting;

use App\Domain\Shared\DomainException;
use App\Models\FiscalPeriod;

/**
 * حارس الفترات المالية: يمنع الترحيل في فترة مقفلة، ويحدد فترة القيد.
 */
class PeriodGuard
{
    public function resolveOpenPeriod(int $companyId, string $date): FiscalPeriod
    {
        $period = FiscalPeriod::query()
            ->where('company_id', $companyId)
            ->whereDate('start_date', '<=', $date)
            ->whereDate('end_date', '>=', $date)
            ->first();

        if (! $period) {
            throw DomainException::make(
                'period.not_found',
                "لا توجد فترة مالية معرّفة تشمل التاريخ {$date}. عرّف السنة والفترات المالية أولًا.",
                ['date' => $date],
            );
        }

        if ($period->status !== 'open') {
            throw DomainException::make(
                'period.closed',
                "الفترة المالية «{$period->name}» مقفلة ولا تقبل الترحيل. يلزم إعادة فتح مصرح بها.",
                ['period_id' => $period->id, 'status' => $period->status],
            );
        }

        return $period;
    }

    public function isOpen(int $companyId, string $date): bool
    {
        try {
            $this->resolveOpenPeriod($companyId, $date);

            return true;
        } catch (DomainException) {
            return false;
        }
    }
}
