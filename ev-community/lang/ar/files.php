<?php

return [
    'kinds' => ['image' => 'صورة', 'document' => 'مستند', 'spreadsheet' => 'جدول بيانات'],
    'errors' => [
        'upload_failed' => 'تعذر رفع الملف، حاول مرة أخرى.',
        'empty' => 'الملف فارغ.',
        'too_large' => 'حجم الملف يتجاوز الحد الأقصى (:max ميجابايت).',
        'mime_not_allowed' => 'نوع الملف (:mime) غير مسموح به.',
        'extension_missing' => 'يجب أن يحتوي اسم الملف على امتداد.',
        'extension_not_allowed' => 'الملفات بامتداد .:extension غير مسموح بها. المسموح: :allowed.',
        'mime_mismatch' => 'محتوى الملف لا يطابق امتداده (.:extension).',
        'image_invalid' => 'تعذر قراءة الصورة. ارفع صورة صالحة بصيغة JPEG أو PNG أو WebP.',
        'image_too_large' => 'أبعاد الصورة كبيرة جدًا (الحد الأقصى :max ميجابكسل).',
        'not_owner_of_upload' => 'يمكنك إرفاق الملفات التي رفعتها بنفسك فقط.',
        'already_claimed' => 'هذا الملف مرتبط بسجل آخر بالفعل.',
        'variant_missing' => 'هذا المقاس غير متاح لهذا الملف.',
        'not_found' => 'الملف غير موجود.',
    ],
    'upload' => [
        'drop_here' => 'أسقط الملف هنا أو اضغط للاختيار',
        'browse' => 'اختيار ملف',
        'selected' => 'الملف المختار',
        'uploading' => 'جارٍ الرفع…',
        'remove' => 'إزالة الملف',
        'allowed' => 'المسموح: :types (بحد أقصى :max ميجابايت)',
        'replace' => 'استبدال',
    ],
];
