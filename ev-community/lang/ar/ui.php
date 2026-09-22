<?php

/*
 * نصوص مكونات الواجهة المشتركة (resources/js/components/shared).
 * الإجراءات والتسميات العامة موجودة في core.php؛ هذا الملف يحتوي فقط على
 * نصوص خاصة بالمكونات. يجب أن تبقى المفاتيح مطابقة لملف lang/en/ui.php.
 */
return [
    'password' => ['show' => 'إظهار كلمة المرور', 'hide' => 'إخفاء كلمة المرور'],
    'table' => [
        'columns' => 'الأعمدة', 'select_all' => 'تحديد كل الصفوف', 'select_row' => 'تحديد الصف', 'selected' => 'تم تحديد :count',
        'clear_selection' => 'إلغاء التحديد', 'sort_by' => 'ترتيب حسب :column', 'rows_per_page' => 'عدد الصفوف في الصفحة', 'toggle_columns' => 'إظهار/إخفاء الأعمدة',
        'loading' => 'جارٍ تحميل الصفوف…', 'open' => 'فتح',
    ],
    'filters' => [
        'title' => 'التصفية', 'active' => ':count مفعّل', 'apply' => 'تطبيق التصفية', 'clear' => 'مسح :label', 'all' => 'الكل',
        'search' => 'بحث…', 'from' => 'من', 'to' => 'إلى', 'yes' => 'نعم', 'no' => 'لا', 'select' => 'اختر…', 'open' => 'فتح التصفية',
        'active_filters' => 'عوامل التصفية المفعّلة',
    ],
    'pagination' => ['label' => 'ترقيم الصفحات', 'previous' => 'الصفحة السابقة', 'next' => 'الصفحة التالية', 'page' => 'صفحة :page', 'more' => 'صفحات أخرى'],
    'confirm' => ['reason_label' => 'السبب', 'reason_placeholder' => 'اشرح السبب (5 أحرف على الأقل)…'],
    'upload' => [
        'drop' => 'اسحب الملفات وأفلتها هنا، أو', 'browse' => 'تصفّح', 'single_drop' => 'اسحب الملف وأفلته هنا، أو', 'max_size' => 'الحد الأقصى :size ميجابايت لكل ملف',
        'accepted' => 'الأنواع المقبولة: :types', 'too_large' => '":name" يتجاوز :size ميجابايت', 'too_many' => 'يمكنك رفع :count ملفات كحد أقصى', 'not_accepted' => '":name" ليس من الأنواع المقبولة',
        'remove' => 'إزالة :name', 'preview' => 'معاينة :name', 'files_count' => ':count ملف|:count ملفات', 'dropzone' => 'منطقة رفع الملفات',
    ],
    'qr' => [
        'loading' => 'جارٍ تحميل الماسح…', 'starting' => 'جارٍ تشغيل الكاميرا…', 'permission_denied' => 'تم رفض الوصول إلى الكاميرا. اسمح بالوصول من إعدادات المتصفح أو أدخل الكود يدويًا.',
        'unsupported' => 'المسح بالكاميرا غير مدعوم على هذا الجهاز. أدخل الكود يدويًا.', 'error' => 'تعذّر تشغيل الكاميرا. جرّب كاميرا أخرى أو أدخل الكود يدويًا.',
        'insecure' => 'تتطلب الكاميرا اتصالًا آمنًا (HTTPS). أدخل الكود يدويًا.',
        'camera' => 'الكاميرا', 'torch_on' => 'تشغيل الفلاش', 'torch_off' => 'إيقاف الفلاش', 'manual_label' => 'أو أدخل الكود يدويًا', 'manual_placeholder' => 'الكود',
        'manual_submit' => 'إرسال الكود', 'paused' => 'الماسح متوقف مؤقتًا', 'retry' => 'إعادة المحاولة', 'viewfinder' => 'وجّه الكاميرا نحو رمز QR', 'scanned' => 'تم مسح الكود',
        'stop' => 'إيقاف الكاميرا', 'start' => 'تشغيل الكاميرا',
    ],
    'map' => [
        'attribution' => '© مساهمو OpenStreetMap', 'locate' => 'استخدام موقعي', 'locating' => 'جارٍ تحديد الموقع…', 'location_denied' => 'تم رفض الوصول إلى الموقع.',
        'location_unavailable' => 'تعذّر تحديد موقعك.', 'location_unsupported' => 'تحديد الموقع غير مدعوم في هذا المتصفح.',
        'cluster' => ':count موقع، قرّب الخريطة للتفاصيل', 'search_placeholder' => 'ابحث عن عنوان…', 'search' => 'بحث', 'no_results' => 'لم يتم العثور على عناوين',
        'latitude' => 'خط العرض', 'longitude' => 'خط الطول', 'drag_hint' => 'اسحب العلامة أو اضغط على الخريطة لتحديد الموقع.', 'marker' => 'علامة الموقع',
        'selected_location' => 'الموقع المحدد', 'you_are_here' => 'أنت هنا', 'loading' => 'جارٍ تحميل الخريطة…', 'results' => 'نتائج البحث',
    ],
    'command' => ['placeholder' => 'اكتب أمرًا أو ابحث…', 'no_results' => 'لا توجد نتائج.', 'results' => 'النتائج', 'searching' => 'جارٍ البحث…', 'open' => 'بحث', 'title' => 'لوحة الأوامر', 'description' => 'ابحث في الصفحات والسجلات والإجراءات'],
    'rating' => ['label' => 'التقييم', 'star' => ':count من :max نجوم', 'value' => ':value من :max', 'clear' => 'مسح التقييم'],
    'progress' => ['of' => ':value من :max', 'percent' => ':percent%'],
    'steps' => ['label' => 'مراحل التقدم', 'step' => 'الخطوة :number', 'done' => 'مكتملة', 'current' => 'الخطوة الحالية', 'pending' => 'قادمة'],
    'alert' => ['dismiss' => 'إغلاق'],
    'phone' => ['call' => 'اتصال بـ :number', 'whatsapp' => 'واتساب :number'],
    'timeline' => ['by' => 'بواسطة :actor', 'label' => 'السجل'],
    'copy' => ['aria' => 'نسخ :label'],
];
