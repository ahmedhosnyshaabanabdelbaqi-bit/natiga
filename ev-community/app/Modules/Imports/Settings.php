<?php

return [
    'imports.max_rows' => ['group' => 'imports', 'type' => 'int', 'default' => 20000, 'public' => false, 'label' => ['ar' => 'الحد الأقصى لعدد صفوف ملف الاستيراد', 'en' => 'Maximum rows per import file'], 'rules' => 'integer|min:100|max:200000'],
    'imports.inline_validation_rows' => ['group' => 'imports', 'type' => 'int', 'default' => 500, 'public' => false, 'label' => ['ar' => 'التحقق الفوري حتى عدد صفوف (أكثر من ذلك يُنفَّذ في الخلفية)', 'en' => 'Validate inline up to N rows (larger files run in the background)'], 'rules' => 'integer|min:0|max:5000'],
    'exports.inline_rows' => ['group' => 'imports', 'type' => 'int', 'default' => 2000, 'public' => false, 'label' => ['ar' => 'التصدير الفوري حتى عدد صفوف (أكثر من ذلك يُنفَّذ في الخلفية)', 'en' => 'Generate exports inline up to N rows (larger exports are queued)'], 'rules' => 'integer|min:0|max:20000'],
    'exports.max_rows' => ['group' => 'imports', 'type' => 'int', 'default' => 100000, 'public' => false, 'label' => ['ar' => 'الحد الأقصى لعدد صفوف ملف التصدير', 'en' => 'Maximum rows per export file'], 'rules' => 'integer|min:100|max:500000'],
    'exports.retention_hours' => ['group' => 'imports', 'type' => 'int', 'default' => 24, 'public' => false, 'label' => ['ar' => 'مدة الاحتفاظ بملفات التصدير (ساعات)', 'en' => 'Export file retention (hours)'], 'rules' => 'integer|min:1|max:168'],
];
