<?php

return [
    'notifications.retention_days' => ['group' => 'notifications', 'type' => 'int', 'default' => 180, 'public' => false, 'label' => ['ar' => 'مدة الاحتفاظ بالإشعارات المقروءة (أيام)', 'en' => 'Retention of read notifications (days)'], 'rules' => 'integer|min:7|max:3650'],
    'notifications.email_from_name_ar' => ['group' => 'notifications', 'type' => 'string', 'default' => null, 'public' => false, 'label' => ['ar' => 'اسم مرسل البريد (عربي)', 'en' => 'Email sender name (Arabic)'], 'rules' => 'nullable|string|max:120'],
    'notifications.email_from_name_en' => ['group' => 'notifications', 'type' => 'string', 'default' => null, 'public' => false, 'label' => ['ar' => 'اسم مرسل البريد (إنجليزي)', 'en' => 'Email sender name (English)'], 'rules' => 'nullable|string|max:120'],
];
