<?php

return [
    // اسم النظام والشركة — قابلان للتغيير من الإعدادات بعد التثبيت
    'system_name' => env('ERP_SYSTEM_NAME', 'محمد فياض'),
    'company_name' => env('ERP_COMPANY_NAME', 'محمد فياض للتوزيع'),
    'currency' => env('ERP_CURRENCY', 'EGP'),
    'cost_method' => env('ERP_COST_METHOD', 'moving_average'),

    // دقة الأرقام
    'money_scale' => 2,
    'qty_scale' => 3,

    // سياسات التشغيل
    'allow_negative_stock' => false,
    'day_close_requires_sync' => true,
    'offline_authorization_hours' => (int) env('ERP_OFFLINE_HOURS', 24),

    // أهداف الأداء المعلنة (تُقاس فعليًا وتُسجَّل نتائجها في تقرير الاختبارات)
    'performance_targets' => [
        'api_p95_ms' => 500,
        'report_p95_ms' => 3000,
    ],
];
