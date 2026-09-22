<?php

return [
    // operations.view lives in app/Modules/System/Permissions.php (exception center is linked from the admin sidebar).
    'operations.manage' => ['label' => ['ar' => 'إدارة مركز الاستثناءات (إسناد/حل/تجاهل)', 'en' => 'Manage exception center (assign/resolve/ignore)'], 'roles' => ['operations-manager']],
    'incidents.view' => ['label' => ['ar' => 'عرض الحوادث التشغيلية', 'en' => 'View incidents'], 'roles' => ['operations-manager', 'accountant', 'support-agent']],
    'incidents.manage' => ['label' => ['ar' => 'إدارة الحوادث التشغيلية والمراجعات', 'en' => 'Manage incidents & post-incident reviews'], 'roles' => ['operations-manager']],
];
