<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| POS runtime configuration
|--------------------------------------------------------------------------
| Values here are DEFAULTS only. Everything a shop can change at runtime is
| stored in the `settings` table and read through Core\Services\SettingsService,
| so switching a shop from "grocery" to "clothing" never requires a code change
| and never drops data: disabled features only hide UI + relax validation.
*/

return [

    'currency' => [
        'code' => env('POS_CURRENCY', 'EGP'),
        'scale' => (int) env('POS_CURRENCY_SCALE', 2),
        'rounding' => env('POS_ROUNDING_MODE', 'half_up'),
        // Cash rounding step for the change drawer; '0' disables cash rounding.
        'cash_step' => env('POS_CASH_STEP', '0'),
        'symbol_ar' => 'ج.م',
    ],

    'locale' => [
        'default' => 'ar',
        'direction' => 'rtl',
        'supported' => ['ar', 'en'],
    ],

    'timezone' => env('POS_TIMEZONE', 'Africa/Cairo'),

    /*
    | Business-day cut-off used by every report so that "today" means the same
    | thing everywhere. A shop closing at 2am sets this to "04:00".
    */
    'business_day_start' => '00:00',

    /*
    |----------------------------------------------------------------------
    | Feature flags (the shop profile toggles these)
    |----------------------------------------------------------------------
    */
    'features' => [
        'variants' => false,        // colour / size
        'weighted_items' => false,  // scales, kg / g
        'serials' => false,         // IMEI, serial numbers, warranty
        'batches' => false,         // batch + expiry tracking
        'multi_unit' => false,      // carton / box / piece
        'taxes' => false,
        'credit_sales' => true,
        'loyalty' => false,
        'promotions' => false,
        'quotes' => false,
        'reservations' => false,
        'delivery' => false,
        'customer_display' => false,
        'warranty' => false,
        'offline_mode' => (bool) env('POS_OFFLINE_ENABLED', true),
        'return_without_invoice' => false, // high risk: off by default
        'negative_stock' => false,         // off by default
    ],

    /*
    |----------------------------------------------------------------------
    | Ready-made activity profiles applied by the setup wizard
    |----------------------------------------------------------------------
    */
    'profiles' => [
        'grocery' => [
            'label_ar' => 'بقالة وميني ماركت',
            'features' => ['weighted_items' => true, 'batches' => true, 'multi_unit' => true],
            'pos_layout' => 'barcode_first',
        ],
        'clothing' => [
            'label_ar' => 'ملابس وأحذية',
            'features' => ['variants' => true],
            'pos_layout' => 'grid_first',
        ],
        'mobiles' => [
            'label_ar' => 'موبايلات وإكسسوارات',
            'features' => ['serials' => true, 'warranty' => true, 'variants' => true],
            'pos_layout' => 'barcode_first',
        ],
        'cosmetics' => [
            'label_ar' => 'مستحضرات تجميل وعطور',
            'features' => ['batches' => true, 'variants' => true],
            'pos_layout' => 'grid_first',
        ],
        'housewares' => [
            'label_ar' => 'أدوات منزلية',
            'features' => ['multi_unit' => true],
            'pos_layout' => 'grid_first',
        ],
        'stationery' => [
            'label_ar' => 'مكتبة وأدوات مكتبية',
            'features' => ['multi_unit' => true],
            'pos_layout' => 'barcode_first',
        ],
        'hardware' => [
            'label_ar' => 'كهرباء وسباكة وعدد',
            'features' => ['multi_unit' => true, 'weighted_items' => true],
            'pos_layout' => 'barcode_first',
        ],
        'spare_parts' => [
            'label_ar' => 'قطع غيار',
            'features' => ['multi_unit' => true, 'serials' => false],
            'pos_layout' => 'barcode_first',
        ],
        'general_retail' => [
            'label_ar' => 'تجزئة عامة',
            'features' => [],
            'pos_layout' => 'barcode_first',
        ],
    ],

    /*
    |----------------------------------------------------------------------
    | Selling rules
    |----------------------------------------------------------------------
    */
    'sales' => [
        // Order in which the totals engine applies money rules. Changing this
        // changes reported figures, so it is explicit and covered by tests.
        'calculation_order' => ['line_discount', 'invoice_discount', 'tax', 'rounding'],
        'tax_mode' => 'exclusive',          // exclusive | inclusive
        'default_cashier_discount_percent' => '0',
        'require_customer_for_credit' => true,
        'allow_price_edit' => false,        // needs `sales.change_price` permission anyway
        'expiry_policy' => 'fefo',          // first expired, first out (picking only)
        'costing_method' => 'moving_average',
    ],

    /*
    |----------------------------------------------------------------------
    | Offline / degraded mode
    |----------------------------------------------------------------------
    */
    'offline' => [
        'enabled' => (bool) env('POS_OFFLINE_ENABLED', true),
        'max_hours' => 12,
        'max_sale_amount' => '5000',
        'allowed_payment_methods' => ['cash'],
        'blocked_operations' => [
            'returns', 'credit_sales', 'loyalty_redeem', 'price_override',
            'serial_sales', 'permission_change', 'shift_close_final',
        ],
        'catalog_cache_ttl_minutes' => 240,
    ],

    'idempotency' => [
        'ttl_hours' => 72,
    ],

    'printing' => [
        'papers' => ['58mm', '80mm', 'a4'],
        'default_receipt' => '80mm',
        'reprint_marks_copy' => true,
    ],

    /*
    | Weight/price embedded barcodes differ per scale vendor, so the parsing
    | rule is data, never a hard-coded assumption.
    */
    'barcode' => [
        'embedded_formats' => [
            // 'prefix' => '21', 'length' => 13, 'item_code' => [2,5], 'value' => [7,5],
            // 'value_kind' => 'weight'|'price', 'value_scale' => 3
        ],
    ],

    'performance' => [
        'lookup_cache_ttl' => 300,
        'page_size' => 50,
        'max_page_size' => 200,
    ],
];
