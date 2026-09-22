<?php

/*
|--------------------------------------------------------------------------
| EV Community Egypt — platform configuration
|--------------------------------------------------------------------------
| Static platform configuration. Anything an operator needs to change at
| runtime lives in system_settings (see App\Modules\System\Services\Settings)
| and module_settings (see App\Modules\System\Services\Modules).
*/

return [
    'locales' => [
        'ar' => ['name' => 'العربية', 'dir' => 'rtl', 'font' => 'Cairo', 'intl' => 'ar-EG'],
        'en' => ['name' => 'English', 'dir' => 'ltr', 'font' => 'Inter', 'intl' => 'en-EG'],
    ],
    'default_locale' => 'ar',

    'base_currency' => 'EGP',
    'timezone' => 'Africa/Cairo',

    'portals' => [
        'member' => ['home' => '/account', 'login' => '/login'],
        'admin' => ['home' => '/admin/dashboard', 'login' => '/admin/login'],
        'partner' => ['home' => '/partner/dashboard', 'login' => '/partner/login'],
    ],

    /*
    | Roles that must have TOTP MFA enabled before they can use the admin panel.
    */
    'mfa_mandatory_roles' => ['owner', 'super-admin', 'accountant'],
    'mfa_mandatory_permissions' => ['refunds.approve', 'roles.manage', 'users.manage', 'payments.approve'],

    /*
    | Modules registry. `core` modules cannot be disabled. Order is the admin sidebar order.
    */
    'modules' => [
        'auth' => ['name' => ['ar' => 'المصادقة', 'en' => 'Authentication'], 'core' => true],
        'members' => ['name' => ['ar' => 'الأعضاء', 'en' => 'Members'], 'core' => true],
        'vehicles' => ['name' => ['ar' => 'السيارات', 'en' => 'Vehicles'], 'core' => true],
        'garage' => ['name' => ['ar' => 'جراجي', 'en' => 'My Garage'], 'core' => true],
        'catalog' => ['name' => ['ar' => 'الكتالوج', 'en' => 'Catalog'], 'core' => false],
        'demand' => ['name' => ['ar' => 'قوائم الرغبات وطلبات القطع', 'en' => 'Wishlist & Part Requests'], 'core' => false],
        'cart' => ['name' => ['ar' => 'السلة', 'en' => 'Cart'], 'core' => false],
        'orders' => ['name' => ['ar' => 'الطلبات', 'en' => 'Orders'], 'core' => false],
        'group_buying' => ['name' => ['ar' => 'الشراء الجماعي', 'en' => 'Group Buying'], 'core' => false],
        'payments' => ['name' => ['ar' => 'المدفوعات', 'en' => 'Payments'], 'core' => true],
        'accounting' => ['name' => ['ar' => 'المحاسبة', 'en' => 'Accounting'], 'core' => true],
        'suppliers' => ['name' => ['ar' => 'الموردون', 'en' => 'Suppliers'], 'core' => false],
        'procurement' => ['name' => ['ar' => 'المشتريات', 'en' => 'Procurement'], 'core' => false],
        'shipping' => ['name' => ['ar' => 'الشحن', 'en' => 'Shipping'], 'core' => false],
        'warehouses' => ['name' => ['ar' => 'المخازن', 'en' => 'Warehouses'], 'core' => false],
        'inventory' => ['name' => ['ar' => 'المخزون', 'en' => 'Inventory'], 'core' => false],
        'events' => ['name' => ['ar' => 'الفعاليات', 'en' => 'Events'], 'core' => false],
        'deliveries' => ['name' => ['ar' => 'التسليم', 'en' => 'Deliveries'], 'core' => false],
        'service_centers' => ['name' => ['ar' => 'مراكز الصيانة', 'en' => 'Service Centers'], 'core' => false],
        'maintenance' => ['name' => ['ar' => 'الصيانة', 'en' => 'Maintenance'], 'core' => false],
        'partners' => ['name' => ['ar' => 'الشركاء والعروض', 'en' => 'Partners & Offers'], 'core' => false],
        'home_charging' => ['name' => ['ar' => 'الشحن المنزلي', 'en' => 'Home Charging'], 'core' => false],
        'charging_stations' => ['name' => ['ar' => 'محطات الشحن', 'en' => 'Charging Stations'], 'core' => false],
        'route_planner' => ['name' => ['ar' => 'مخطط الشحن على الطريق (تجريبي)', 'en' => 'Route Charging Planner (experimental)'], 'core' => false, 'experimental' => true, 'default_enabled' => false],
        'warranty' => ['name' => ['ar' => 'الضمان', 'en' => 'Warranty'], 'core' => false],
        'knowledge_base' => ['name' => ['ar' => 'قاعدة المعرفة', 'en' => 'Knowledge Base'], 'core' => false],
        'campaigns' => ['name' => ['ar' => 'الحملات والاستدعاءات', 'en' => 'Campaigns & Recalls'], 'core' => false],
        'support' => ['name' => ['ar' => 'الدعم والشكاوى', 'en' => 'Support'], 'core' => true],
        'reviews' => ['name' => ['ar' => 'التقييمات', 'en' => 'Reviews'], 'core' => false],
        'notifications' => ['name' => ['ar' => 'الإشعارات', 'en' => 'Notifications'], 'core' => true],
        'surveys' => ['name' => ['ar' => 'الاستبيانات', 'en' => 'Surveys'], 'core' => false],
        'referrals' => ['name' => ['ar' => 'الإحالات', 'en' => 'Referrals'], 'core' => false],
        'reports' => ['name' => ['ar' => 'التقارير', 'en' => 'Reports'], 'core' => true],
        'cms' => ['name' => ['ar' => 'إدارة المحتوى', 'en' => 'CMS'], 'core' => true],
        'audit' => ['name' => ['ar' => 'سجل التدقيق', 'en' => 'Audit'], 'core' => true],
        'system' => ['name' => ['ar' => 'إعدادات النظام', 'en' => 'System'], 'core' => true],
        'integrations' => ['name' => ['ar' => 'التكاملات', 'en' => 'Integrations'], 'core' => true],
        'files' => ['name' => ['ar' => 'الملفات', 'en' => 'Files'], 'core' => true],
        'imports' => ['name' => ['ar' => 'الاستيراد والتصدير', 'en' => 'Imports & Exports'], 'core' => true],
    ],

    'uploads' => [
        // hard ceilings in bytes; operator-adjustable limits (settings) can only go below these
        'max_image_bytes' => 10 * 1024 * 1024,
        'max_document_bytes' => 20 * 1024 * 1024,
        'image_mimes' => ['image/jpeg', 'image/png', 'image/webp'],
        'document_mimes' => ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        'spreadsheet_mimes' => ['text/csv', 'text/plain', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ],

    'map' => [
        'provider' => env('MAP_PROVIDER', 'osm'), // osm|google|mapbox|none — only non-sensitive config reaches the browser
        'public_key' => env('MAP_PUBLIC_KEY'),
        'server_key' => env('MAP_SERVER_KEY'),
        'default_lat' => (float) env('MAP_DEFAULT_LAT', 30.0444),
        'default_lng' => (float) env('MAP_DEFAULT_LNG', 31.2357),
        'default_zoom' => (int) env('MAP_DEFAULT_ZOOM', 7),
        'tile_url' => env('MAP_TILE_URL', 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'),
    ],

    'integrations' => [
        // Map provider: 'osm' = OpenStreetMap tiles + Nominatim geocoding (no key); 'none' disables maps.
        'map' => [
            'driver' => env('MAP_PROVIDER', 'osm'),
            'nominatim_url' => env('MAP_NOMINATIM_URL', 'https://nominatim.openstreetmap.org'),
            'nominatim_rate_per_second' => (int) env('MAP_NOMINATIM_RATE_PER_SECOND', 1),
        ],
        'payment' => ['driver' => env('PAYMENT_PROVIDER', 'none')],
        'sms' => ['driver' => env('SMS_PROVIDER', 'none')],
        'whatsapp' => ['driver' => env('WHATSAPP_PROVIDER', 'none')],
        'shipping' => ['driver' => env('SHIPPING_PROVIDER', 'manual')],
        'charging' => ['driver' => env('CHARGING_PROVIDER', 'none')],
        'exchange_rate' => ['driver' => env('EXCHANGE_RATE_PROVIDER', 'manual'), 'stale_days' => (int) env('EXCHANGE_RATE_STALE_DAYS', 7)],
        'email' => ['driver' => env('MAIL_MAILER', 'log'), 'force_configured' => false],
        'search' => ['driver' => env('SEARCH_DRIVER', 'database')],
    ],

    'security' => [
        // Strict CSP is on in production; locally the Vite dev server needs a relaxed policy.
        'csp_enabled' => (bool) env('EV_CSP_ENABLED', env('APP_ENV') === 'production'),
        // Extra hosts allowed for XHR/fetch (comma separated), e.g. a map/geocoding API.
        'csp_connect_hosts' => env('EV_CSP_CONNECT_HOSTS', ''),
    ],

    'demo' => [
        'allow_in_production' => (bool) env('EV_ALLOW_DEMO_DATA_IN_PRODUCTION', false),
    ],
];
