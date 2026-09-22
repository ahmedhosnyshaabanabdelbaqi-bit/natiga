<?php

return [
    'title' => 'Settings',
    'description' => 'Manage your profile and account settings',
    'nav' => ['label' => 'Settings', 'profile' => 'Profile', 'security' => 'Security', 'appearance' => 'Appearance', 'sessions' => 'Sessions', 'privacy' => 'Privacy'],
    'profile' => [
        'title' => 'Profile settings', 'heading' => 'Profile', 'description' => 'Update your name and email address',
        'name' => 'Name', 'name_placeholder' => 'Full name', 'email' => 'Email address', 'email_placeholder' => 'Email address',
        'unverified' => 'Your email address is unverified.', 'resend_verification' => 'Click here to re-send the verification email.',
        'verification_sent' => 'A new verification link has been sent to your email address.',
        'save' => 'Save', 'updated' => 'Profile updated.',
    ],
    'security' => [
        'title' => 'Security settings', 'password_heading' => 'Update password',
        'password_description' => 'Ensure your account is using a long, random password to stay secure',
        'current_password' => 'Current password', 'new_password' => 'New password', 'confirm_password' => 'Confirm password',
        'save' => 'Save', 'password_updated' => 'Password updated.',
    ],
    'appearance' => [
        'title' => 'Appearance settings', 'description' => 'Update the appearance settings for your account',
        'light' => 'Light', 'dark' => 'Dark', 'system' => 'System',
    ],
    'two_factor' => [
        'heading' => 'Two-factor authentication', 'description' => 'Manage your two-factor authentication settings',
        'enabled_text' => 'You will be prompted for a secure, random pin during login, which you can retrieve from the TOTP-supported application on your phone.',
        'disabled_text' => 'When you enable two-factor authentication, you will be prompted for a secure pin during login. This pin can be retrieved from a TOTP-supported application on your phone.',
        'enable' => 'Enable 2FA', 'disable' => 'Disable 2FA', 'continue_setup' => 'Continue setup',
        'modal' => [
            'enabled_title' => 'Two-factor authentication enabled',
            'enabled_description' => 'Two-factor authentication is now enabled. Scan the QR code or enter the setup key in your authenticator app.',
            'verify_title' => 'Verify authentication code', 'verify_description' => 'Enter the 6-digit code from your authenticator app',
            'setup_title' => 'Enable two-factor authentication',
            'setup_description' => 'To finish enabling two-factor authentication, scan the QR code or enter the setup key in your authenticator app',
            'close' => 'Close', 'continue' => 'Continue', 'back' => 'Back', 'confirm' => 'Confirm',
            'or_manual' => 'or, enter the code manually', 'copy_key' => 'Copy setup key', 'qr_alt' => 'QR code for your authenticator app',
        ],
        'recovery' => [
            'title' => '2FA recovery codes',
            'description' => 'Recovery codes let you regain access if you lose your 2FA device. Store them in a secure password manager.',
            'view' => 'View recovery codes', 'hide' => 'Hide recovery codes', 'regenerate' => 'Regenerate codes',
            'list_label' => 'Recovery codes', 'loading' => 'Loading recovery codes',
            'note' => 'Each recovery code can be used once to access your account and will be removed after use. If you need more, click :action above.',
        ],
        'errors' => ['qr_code' => 'Failed to fetch QR code', 'setup_key' => 'Failed to fetch a setup key', 'recovery_codes' => 'Failed to fetch recovery codes'],
    ],
    'passkeys' => [
        'heading' => 'Passkeys', 'description' => 'Manage your passkeys for passwordless sign-in',
        'empty_title' => 'No passkeys yet', 'empty_description' => 'Add a passkey to sign in without a password',
        'added' => 'Added :time', 'last_used' => 'Last used :time', 'remove' => 'Remove', 'remove_title' => 'Remove passkey',
        'remove_description' => 'Are you sure you want to remove the ":name" passkey? You will no longer be able to use it to sign in.',
        'removing' => 'Removing…', 'cancel' => 'Cancel', 'unsupported' => 'Passkeys are not supported in this browser.',
        'add' => 'Add passkey', 'name' => 'Passkey name', 'name_placeholder' => 'e.g., MacBook Pro, iPhone',
        'name_hint' => 'A name helps you identify this passkey later.', 'registering' => 'Registering…', 'register' => 'Register passkey',
        'default_name' => ':browser on :os',
    ],
    'delete_account' => [
        'heading' => 'Delete account', 'description' => 'Delete your account and all of its resources',
        'warning_title' => 'Warning', 'warning_text' => 'Please proceed with caution, this cannot be undone.',
        'button' => 'Delete account', 'confirm_title' => 'Are you sure you want to delete your account?',
        'confirm_description' => 'Once your account is deleted, all of its resources and data will also be permanently deleted. Please enter your password to confirm you would like to permanently delete your account.',
        'password' => 'Password', 'cancel' => 'Cancel',
    ],
];
