<?php

return [
    'admin.access' => ['label' => ['ar' => 'الدخول إلى لوحة الإدارة', 'en' => 'Access admin panel'], 'roles' => ['operations-manager', 'accountant', 'procurement-officer', 'shipping-officer', 'warehouse-officer', 'delivery-officer', 'maintenance-manager', 'charging-content-manager', 'content-manager', 'support-agent']],
    'partner.access' => ['label' => ['ar' => 'الدخول إلى بوابة الشركاء', 'en' => 'Access partner portal'], 'roles' => ['service-center-admin', 'service-center-employee']],
    'settings.view' => ['label' => ['ar' => 'عرض إعدادات النظام', 'en' => 'View system settings'], 'roles' => ['operations-manager']],
    'settings.manage' => ['label' => ['ar' => 'تعديل إعدادات النظام', 'en' => 'Manage system settings'], 'roles' => []],
    'modules.manage' => ['label' => ['ar' => 'تفعيل/تعطيل الوحدات', 'en' => 'Enable/disable modules'], 'roles' => []],
    'users.view' => ['label' => ['ar' => 'عرض المستخدمين الإداريين', 'en' => 'View admin users'], 'roles' => ['operations-manager']],
    'users.manage' => ['label' => ['ar' => 'إدارة المستخدمين الإداريين', 'en' => 'Manage admin users'], 'roles' => []],
    'roles.manage' => ['label' => ['ar' => 'إدارة الأدوار والصلاحيات', 'en' => 'Manage roles & permissions'], 'roles' => []],
    'banners.manage' => ['label' => ['ar' => 'إدارة إشعارات الحالة', 'en' => 'Manage status banners'], 'roles' => ['operations-manager', 'content-manager']],
    'operations.view' => ['label' => ['ar' => 'عرض لوحة التشغيل ومركز الاستثناءات', 'en' => 'View operations dashboard & exception center'], 'roles' => ['operations-manager', 'accountant', 'warehouse-officer', 'shipping-officer', 'support-agent']],
    'jobs.manage' => ['label' => ['ar' => 'إدارة المهام الفاشلة', 'en' => 'Manage failed jobs'], 'roles' => ['operations-manager']],
    'integrations.view' => ['label' => ['ar' => 'عرض حالة التكاملات', 'en' => 'View integrations status'], 'roles' => ['operations-manager']],
    'integrations.manage' => ['label' => ['ar' => 'إدارة التكاملات', 'en' => 'Manage integrations'], 'roles' => []],
];
