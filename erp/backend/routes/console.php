<?php

use App\Domain\Inventory\ReservationService;
use App\Models\ExceptionSignal;
use App\Support\Dec;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;

/*
|--------------------------------------------------------------------------
| المهام المجدولة
|--------------------------------------------------------------------------
| تعمل عبر حاوية scheduler (php artisan schedule:work) أو عبر cron على
| الخادم المحلي:  * * * * * php /path/artisan schedule:run
*/

// نسخة احتياطية يومية مشفرة عند الثانية صباحًا
Schedule::command('erp:backup')
    ->dailyAt('02:00')
    ->withoutOverlapping()
    ->onFailure(function () {
        // فشل النسخ حدث يستحق تنبيهًا، لا صمتًا
        DB::table('notifications_outbox')->insert([
            'company_id' => DB::table('companies')->value('id'),
            'channel' => 'email',
            'recipient' => (string) env('ERP_ALERT_EMAIL', 'admin@localhost'),
            'subject' => 'فشل النسخة الاحتياطية',
            'body' => 'تعذّر إنشاء النسخة الاحتياطية اليومية. راجع سجل الخادم فورًا.',
            'status' => 'queued',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    });

// اختبار استعادة أسبوعي — وجود الملف ليس دليلًا على نجاح الاستعادة
Schedule::command('erp:restore-test')
    ->weeklyOn(5, '03:00')
    ->withoutOverlapping();

// تنظيف الحجوزات المنتهية حتى لا تحجز رصيدًا بلا مستند
Schedule::call(function () {
    $count = app(ReservationService::class)->expireStale();

    if ($count > 0) {
        logger()->info("تم إنهاء {$count} حجزًا منتهي الصلاحية.");
    }
})->hourly()->name('expire-stale-reservations')->withoutOverlapping();

// إنهاء تفويضات العمل دون اتصال المنتهية
Schedule::call(function () {
    DB::table('offline_stock_quotas')
        ->where('status', 'active')
        ->whereNotNull('expires_at')
        ->where('expires_at', '<', now())
        ->update(['status' => 'expired', 'updated_at' => now()]);

    DB::table('offline_credit_quotas')
        ->where('status', 'active')
        ->whereNotNull('expires_at')
        ->where('expires_at', '<', now())
        ->update(['status' => 'expired', 'updated_at' => now()]);
})->hourly()->name('expire-offline-quotas')->withoutOverlapping();

/**
 * مركز الاستثناءات — إشارات للمراجعة البشرية، وليست اتهامات ولا جزاءات آلية.
 */
Schedule::call(function () {
    $companyId = DB::table('companies')->value('id');

    if (! $companyId) {
        return;
    }

    $today = now()->toDateString();

    // 1) بيع بهامش منخفض
    $lowMarginThreshold = '5';

    $lowMargin = DB::table('sales_invoices')
        ->where('company_id', $companyId)
        ->where('status', '!=', 'cancelled')
        ->whereDate('invoice_date', $today)
        ->where('total_amount', '>', 0)
        ->whereRaw('((total_amount - total_cost) / NULLIF(total_amount, 0)) * 100 < ?', [$lowMarginThreshold])
        ->get(['id', 'invoice_no', 'salesman_id', 'total_amount', 'total_cost']);

    foreach ($lowMargin as $invoice) {
        $margin = Dec::isZero($invoice->total_amount)
            ? '0'
            : Dec::money(Dec::mul(Dec::div(Dec::sub($invoice->total_amount, $invoice->total_cost), $invoice->total_amount), 100));

        ExceptionSignal::firstOrCreate(
            ['company_id' => $companyId, 'signal_type' => 'low_margin', 'source_type' => 'sales_invoice', 'source_id' => $invoice->id],
            [
                'severity' => 'warning',
                'subject_type' => 'salesman',
                'subject_id' => $invoice->salesman_id,
                'signal_date' => $today,
                'metric_value' => $margin,
                'threshold_value' => $lowMarginThreshold,
                'description' => "الفاتورة {$invoice->invoice_no} بهامش {$margin}% أقل من الحد {$lowMarginThreshold}%.",
                'status' => 'open',
            ],
        );
    }

    // 2) تأخر إيداع العهدة: رصيد عهدة قائم منذ أكثر من يومين
    $staleCustody = DB::table('cash_boxes as cb')
        ->join('journal_lines as jl', 'jl.account_id', '=', 'cb.account_id')
        ->join('journal_entries as je', 'je.id', '=', 'jl.journal_entry_id')
        ->where('cb.company_id', $companyId)
        ->where('cb.type', 'custody')
        ->where('je.status', 'posted')
        ->whereDate('je.entry_date', '<=', now()->subDays(2)->toDateString())
        ->groupBy('cb.id', 'cb.name', 'cb.owner_user_id')
        ->havingRaw('SUM(jl.debit - jl.credit) > 0')
        ->get(['cb.id', 'cb.name', DB::raw('SUM(jl.debit - jl.credit) AS balance')]);

    foreach ($staleCustody as $box) {
        ExceptionSignal::firstOrCreate(
            ['company_id' => $companyId, 'signal_type' => 'late_deposit', 'source_type' => 'cash_box', 'source_id' => $box->id, 'signal_date' => $today],
            [
                'severity' => 'warning',
                'signal_date' => $today,
                'metric_value' => Dec::money($box->balance),
                'description' => "عهدة «{$box->name}» عليها رصيد ".Dec::money($box->balance)." لم يُورَّد منذ أكثر من يومين.",
                'status' => 'open',
            ],
        );
    }

    // 3) ارتفاع المرتجعات لعميل
    $highReturns = DB::table('sales_returns')
        ->where('company_id', $companyId)
        ->where('status', 'posted')
        ->whereDate('return_date', '>=', now()->subDays(30)->toDateString())
        ->groupBy('customer_id')
        ->havingRaw('COUNT(*) >= 3')
        ->get(['customer_id', DB::raw('COUNT(*) AS cnt'), DB::raw('SUM(total_amount) AS total')]);

    foreach ($highReturns as $row) {
        ExceptionSignal::firstOrCreate(
            ['company_id' => $companyId, 'signal_type' => 'high_returns', 'subject_type' => 'customer', 'subject_id' => $row->customer_id, 'signal_date' => $today],
            [
                'severity' => 'info',
                'signal_date' => $today,
                'metric_value' => Dec::money($row->total),
                'threshold_value' => '3',
                'description' => "العميل عليه {$row->cnt} مرتجعات خلال 30 يومًا بقيمة ".Dec::money($row->total).".",
                'status' => 'open',
            ],
        );
    }
})->dailyAt('23:30')->name('generate-exception-signals')->withoutOverlapping();
