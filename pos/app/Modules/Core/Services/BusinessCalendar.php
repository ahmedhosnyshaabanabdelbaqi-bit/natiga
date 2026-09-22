<?php

declare(strict_types=1);

namespace App\Modules\Core\Services;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * One definition of "today" for the whole system.
 *
 * Timestamps are stored in UTC. Reports and shift close-outs bucket them into a
 * BUSINESS day expressed in the shop's timezone, optionally starting at a
 * cut-off (a shop closing at 2am sets business_day_start = "04:00" so the night
 * belongs to the previous day). Every report uses this, so two reports can never
 * disagree about the same range.
 */
class BusinessCalendar
{
    public function __construct(private readonly SettingsService $settings) {}

    public function timezone(): string
    {
        return $this->settings->timezone();
    }

    public function now(): CarbonImmutable
    {
        return CarbonImmutable::now($this->timezone());
    }

    /** The business date a given instant belongs to, as Y-m-d. */
    public function businessDate(?CarbonInterface $at = null): string
    {
        $local = CarbonImmutable::instance($at ?? CarbonImmutable::now())->setTimezone($this->timezone());
        $start = (string) $this->settings->get('business_day_start', config('pos.business_day_start', '00:00'));

        [$h, $m] = array_pad(explode(':', $start), 2, '0');
        $cutoff = $local->setTime((int) $h, (int) $m, 0);

        if ($local->lessThan($cutoff)) {
            $local = $local->subDay();
        }

        return $local->toDateString();
    }

    /** UTC [from, to] instants covering one or more business days. */
    public function businessDayRange(string $fromDate, ?string $toDate = null): array
    {
        $tz = $this->timezone();
        $start = (string) $this->settings->get('business_day_start', config('pos.business_day_start', '00:00'));
        [$h, $m] = array_pad(explode(':', $start), 2, '0');

        $from = CarbonImmutable::parse($fromDate, $tz)->setTime((int) $h, (int) $m, 0);
        $to = CarbonImmutable::parse($toDate ?? $fromDate, $tz)->setTime((int) $h, (int) $m, 0)->addDay();

        return [$from->utc(), $to->utc()];
    }
}
