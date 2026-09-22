<?php

return [
    'members.registration_mode' => ['group' => 'members', 'type' => 'select', 'default' => 'admin_approval', 'public' => true, 'label' => ['ar' => 'وضع التسجيل', 'en' => 'Registration mode'], 'rules' => 'required|in:open,invitation_only,admin_approval', 'options' => ['open', 'invitation_only', 'admin_approval']],
    'members.require_mobile' => ['group' => 'members', 'type' => 'bool', 'default' => true, 'public' => true, 'label' => ['ar' => 'رقم الموبايل إلزامي عند التسجيل', 'en' => 'Mobile number required at registration'], 'rules' => 'boolean'],
    'members.membership_card_validity_days' => ['group' => 'members', 'type' => 'int', 'default' => 365, 'public' => false, 'label' => ['ar' => 'صلاحية بطاقة العضوية (أيام)', 'en' => 'Membership card validity (days)'], 'rules' => 'integer|min:30|max:3650'],
    'members.qr_token_ttl_minutes' => ['group' => 'members', 'type' => 'int', 'default' => 10, 'public' => false, 'label' => ['ar' => 'صلاحية رمز QR الديناميكي (دقائق)', 'en' => 'Dynamic QR token TTL (minutes)'], 'rules' => 'integer|min:1|max:60'],
];
