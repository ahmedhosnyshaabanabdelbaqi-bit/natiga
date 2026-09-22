<?php

return [
    // ---- Branding (editable from admin, no code changes) ----
    'branding.site_name_ar' => ['group' => 'branding', 'type' => 'string', 'default' => 'مجتمع السيارات الكهربائية في مصر', 'public' => true, 'label' => ['ar' => 'اسم الموقع (عربي)', 'en' => 'Site name (Arabic)'], 'rules' => 'required|string|max:120'],
    'branding.site_name_en' => ['group' => 'branding', 'type' => 'string', 'default' => 'EV Community Egypt', 'public' => true, 'label' => ['ar' => 'اسم الموقع (إنجليزي)', 'en' => 'Site name (English)'], 'rules' => 'required|string|max:120'],
    'branding.tagline_ar' => ['group' => 'branding', 'type' => 'string', 'default' => 'عربيتك، طلباتك وصيانتك في مكان واحد.', 'public' => true, 'label' => ['ar' => 'الشعار النصي (عربي)', 'en' => 'Tagline (Arabic)'], 'rules' => 'nullable|string|max:200'],
    'branding.tagline_en' => ['group' => 'branding', 'type' => 'string', 'default' => 'Your EV, orders and maintenance — all in one place.', 'public' => true, 'label' => ['ar' => 'الشعار النصي (إنجليزي)', 'en' => 'Tagline (English)'], 'rules' => 'nullable|string|max:200'],
    'branding.logo_path' => ['group' => 'branding', 'type' => 'image', 'default' => null, 'public' => true, 'label' => ['ar' => 'الشعار', 'en' => 'Logo'], 'rules' => 'nullable|string'],
    'branding.logo_dark_path' => ['group' => 'branding', 'type' => 'image', 'default' => null, 'public' => true, 'label' => ['ar' => 'الشعار (الوضع الداكن)', 'en' => 'Logo (dark mode)'], 'rules' => 'nullable|string'],
    'branding.favicon_path' => ['group' => 'branding', 'type' => 'image', 'default' => null, 'public' => true, 'label' => ['ar' => 'أيقونة الموقع', 'en' => 'Favicon'], 'rules' => 'nullable|string'],
    'branding.primary_color' => ['group' => 'branding', 'type' => 'string', 'default' => '#0B1220', 'public' => true, 'label' => ['ar' => 'اللون الأساسي', 'en' => 'Primary color'], 'rules' => 'required|regex:/^#[0-9A-Fa-f]{6}$/'],
    'branding.accent_color' => ['group' => 'branding', 'type' => 'string', 'default' => '#0F766E', 'public' => true, 'label' => ['ar' => 'اللون المميز', 'en' => 'Accent color'], 'rules' => 'required|regex:/^#[0-9A-Fa-f]{6}$/'],
    'branding.background_color' => ['group' => 'branding', 'type' => 'string', 'default' => '#F8FAFC', 'public' => true, 'label' => ['ar' => 'لون الخلفية', 'en' => 'Background color'], 'rules' => 'required|regex:/^#[0-9A-Fa-f]{6}$/'],

    // ---- Organization / contact ----
    'general.contact_email' => ['group' => 'general', 'type' => 'string', 'default' => null, 'public' => true, 'label' => ['ar' => 'بريد التواصل', 'en' => 'Contact email'], 'rules' => 'nullable|email'],
    'general.contact_phone' => ['group' => 'general', 'type' => 'string', 'default' => null, 'public' => true, 'label' => ['ar' => 'هاتف التواصل', 'en' => 'Contact phone'], 'rules' => 'nullable|string|max:30'],
    'general.contact_whatsapp' => ['group' => 'general', 'type' => 'string', 'default' => null, 'public' => true, 'label' => ['ar' => 'واتساب', 'en' => 'WhatsApp'], 'rules' => 'nullable|string|max:30'],
    'general.address_ar' => ['group' => 'general', 'type' => 'text', 'default' => null, 'public' => true, 'label' => ['ar' => 'العنوان (عربي)', 'en' => 'Address (Arabic)'], 'rules' => 'nullable|string|max:300'],
    'general.address_en' => ['group' => 'general', 'type' => 'text', 'default' => null, 'public' => true, 'label' => ['ar' => 'العنوان (إنجليزي)', 'en' => 'Address (English)'], 'rules' => 'nullable|string|max:300'],
    'general.social_links' => ['group' => 'general', 'type' => 'json', 'default' => [], 'public' => true, 'label' => ['ar' => 'روابط التواصل الاجتماعي', 'en' => 'Social links'], 'rules' => 'nullable|array'],
    'general.default_locale' => ['group' => 'general', 'type' => 'select', 'default' => 'ar', 'public' => true, 'label' => ['ar' => 'اللغة الافتراضية', 'en' => 'Default language'], 'rules' => 'required|in:ar,en', 'options' => ['ar', 'en'], 'option_labels' => ['ar' => ['ar' => 'العربية', 'en' => 'Arabic'], 'en' => ['ar' => 'الإنجليزية', 'en' => 'English']]],
    'general.homepage_sections' => ['group' => 'general', 'type' => 'json', 'default' => ['hero', 'vehicle_selector', 'search_parts', 'featured_products', 'group_buys', 'maintenance_offers', 'charging_stations', 'partner_offers', 'events', 'knowledge', 'community_cta'], 'public' => true, 'label' => ['ar' => 'ترتيب أقسام الصفحة الرئيسية', 'en' => 'Homepage sections order'], 'rules' => 'nullable|array'],

    // ---- Security ----
    'security.mfa_mandatory_for_admins' => ['group' => 'security', 'type' => 'bool', 'default' => true, 'public' => false, 'label' => ['ar' => 'إلزام المصادقة الثنائية للأدوار الحساسة', 'en' => 'Mandatory MFA for privileged roles'], 'rules' => 'boolean'],
    'security.session_lifetime_minutes' => ['group' => 'security', 'type' => 'int', 'default' => 120, 'public' => false, 'label' => ['ar' => 'مدة الجلسة (دقائق)', 'en' => 'Session lifetime (minutes)'], 'rules' => 'integer|min:15|max:1440'],
    'security.require_email_verification' => ['group' => 'security', 'type' => 'bool', 'default' => false, 'public' => true, 'label' => ['ar' => 'طلب تأكيد البريد قبل استخدام البوابة', 'en' => 'Require email verification before using the portal'], 'rules' => 'boolean'],

    // ---- Files ----
    'files.max_image_mb' => ['group' => 'files', 'type' => 'int', 'default' => 10, 'public' => false, 'label' => ['ar' => 'الحد الأقصى للصور (MB)', 'en' => 'Max image size (MB)'], 'rules' => 'integer|min:1|max:10'],
    'files.max_document_mb' => ['group' => 'files', 'type' => 'int', 'default' => 20, 'public' => false, 'label' => ['ar' => 'الحد الأقصى للمستندات (MB)', 'en' => 'Max document size (MB)'], 'rules' => 'integer|min:1|max:20'],

    // ---- Maintenance mode / notices ----
    'system.maintenance_message_ar' => ['group' => 'system', 'type' => 'text', 'default' => 'الموقع تحت الصيانة حاليًا، سنعود قريبًا.', 'public' => true, 'label' => ['ar' => 'رسالة الصيانة (عربي)', 'en' => 'Maintenance message (Arabic)'], 'rules' => 'nullable|string|max:300'],
    'system.maintenance_message_en' => ['group' => 'system', 'type' => 'text', 'default' => 'The platform is under maintenance. We will be back shortly.', 'public' => true, 'label' => ['ar' => 'رسالة الصيانة (إنجليزي)', 'en' => 'Maintenance message (English)'], 'rules' => 'nullable|string|max:300'],
];
