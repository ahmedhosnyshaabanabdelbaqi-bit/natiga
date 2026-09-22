<?php

return [
    'title' => 'Privacy & data',
    'description' => 'What we store about you, your marketing preferences and how to leave.',
    'summary' => [
        'title' => 'What we store',
        'intro' => 'In plain language, this is the personal data linked to your account:',
        'items' => [
            'identity' => 'Identity: your name, email and mobile number, used to contact you about orders, bookings and your membership.',
            'membership' => 'Membership: member number, status, join date, governorate and referral code.',
            'vehicles' => 'Vehicles: the cars you add to your garage (make, model, year and an optional VIN stored encrypted).',
            'activity' => 'Activity: orders, payments, bookings, support tickets and event registrations.',
            'consents' => 'Consents: the terms, privacy policy and marketing choices you accepted or withdrew, with dates.',
            'security' => 'Security: login history, IP addresses and security events kept to protect your account.',
        ],
        'retention' => 'Financial records (orders, payments, receipts, ledger entries) and audit logs are retained as required by law, even after a deletion request.',
        'your_data' => 'Your identity data right now',
    ],
    'consents' => [
        'title' => 'Marketing preferences',
        'description' => 'Choose how we may contact you with offers and news. Transactional messages (orders, bookings, security) are always sent.',
        'terms' => 'Terms & conditions', 'privacy' => 'Privacy policy',
        'marketing_email' => 'Marketing emails', 'marketing_sms' => 'Marketing SMS', 'marketing_whatsapp' => 'Marketing WhatsApp messages',
        'saved' => 'Preferences saved.', 'history' => 'Consent history', 'granted' => 'Granted', 'withdrawn' => 'Withdrawn', 'source' => 'Source', 'version' => 'Version', 'empty' => 'No consent records yet.',
    ],
    'deactivate' => [
        'title' => 'Deactivate my account',
        'description' => 'Your account is disabled immediately and you are signed out everywhere. Your data is kept and only our staff can reactivate the account.',
        'action' => 'Deactivate account', 'confirm_title' => 'Deactivate your account?', 'confirm_text' => 'Enter your password to confirm. You will be signed out on every device.',
        'password' => 'Current password', 'reason' => 'Reason (optional)', 'done' => 'Your account has been deactivated. Contact support to reactivate it.',
    ],
    'deletion' => [
        'title' => 'Delete my personal data',
        'description' => 'Ask us to erase your personal data. Our team reviews the request; once completed your name, email and mobile are anonymised and the account is closed.',
        'retention_note' => 'Financial and legal records (orders, payments, receipts, ledger entries and audit logs) are retained as required by law, without your identifying details.',
        'action' => 'Request deletion', 'acknowledge_label' => 'I understand that financial and legal records are retained and that this cannot be undone once processed.',
        'reason' => 'Reason (optional)', 'submitted' => 'Your deletion request was submitted. We will contact you when it is processed.',
        'pending_title' => 'Deletion request pending', 'pending_text' => 'Requested :date. Our team is reviewing it.',
        'completed_title' => 'Deletion request completed', 'rejected_title' => 'Deletion request rejected', 'processed_text' => 'Processed :date.',
        'status' => ['requested' => 'Requested', 'under_review' => 'Under review', 'completed' => 'Completed', 'rejected' => 'Rejected'],
        'errors' => ['already_open' => 'You already have an open deletion request.', 'not_open' => 'This deletion request is no longer open.'],
        'reviewed' => 'Request marked as under review.', 'completed' => 'Personal data anonymised and request completed.', 'rejected' => 'Deletion request rejected.',
    ],
];
