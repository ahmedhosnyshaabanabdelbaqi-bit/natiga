<?php

return [
    'failed' => 'These credentials do not match our records.',
    'password' => 'The provided password is incorrect.',
    'throttle' => 'Too many login attempts. Please try again in :seconds seconds.',
    'account_disabled' => 'This account has been disabled. Contact support.',
    'no_membership' => 'No membership is linked to this user.',
    'no_admin_access' => 'You do not have access to the admin panel.',
    'no_partner_access' => 'You do not have access to the partner portal.',
    'portal_access_denied' => 'Your account cannot use that portal; you were redirected to the right space.',
    'invalid_invitation_code' => 'The invitation code is not valid.',
    'fields' => ['name' => 'Name', 'email' => 'Email', 'mobile' => 'Mobile number', 'password' => 'Password', 'terms' => 'Terms acceptance', 'invitation_code' => 'Invitation code', 'password_confirmation' => 'Confirm password', 'code' => 'Authentication code', 'recovery_code' => 'Recovery code'],
    'login' => [
        'title' => 'Log in', 'description' => 'Enter your email and password', 'admin_title' => 'Admin panel', 'admin_description' => 'Staff accounts only',
        'partner_title' => 'Service center & partner portal', 'partner_description' => 'For service center and partner users', 'remember' => 'Remember me', 'forgot' => 'Forgot password?',
        'submit' => 'Log in', 'no_account' => "Don't have an account?", 'register' => 'Join us', 'or_passkey' => 'or use a passkey',
    ],
    'register' => [
        'title' => 'Create your membership', 'description' => 'Join the EV community in Egypt', 'submit' => 'Create account', 'have_account' => 'Already have an account?',
        'terms_prefix' => 'I agree to the', 'terms' => 'Terms & Conditions', 'and' => 'and', 'privacy' => 'Privacy Policy', 'referral_source' => 'How did you hear about us?', 'invitation_code' => 'Invitation code',
        'pending_notice' => 'Your membership request will be reviewed by the admins before activation.', 'invitation_notice' => 'Registration is by invitation only. Enter an invitation code from an existing member.',
        'password_confirmation' => 'Confirm password', 'governorate' => 'Governorate',
    ],
    'forgot' => ['title' => 'Forgot password', 'description' => 'Enter your email to receive a password reset link', 'submit' => 'Email reset link', 'back' => 'Back to log in', 'or_return' => 'Or, return to', 'login_link' => 'log in'],
    'reset' => ['title' => 'Reset password', 'submit' => 'Save password', 'description' => 'Please enter your new password below'],
    'verify' => ['title' => 'Verify your email', 'description' => 'We sent a verification link to your email. If you did not receive it, you can resend it.', 'resend' => 'Resend', 'sent' => 'A new verification link has been sent.', 'logout' => 'Log out'],
    'two_factor' => ['title' => 'Two-factor authentication', 'description' => 'Enter the code from your authenticator app', 'recovery' => 'Use a recovery code', 'use_code' => 'Use an authentication code', 'submit' => 'Continue', 'required_title' => 'Two-factor authentication required', 'required_description' => 'Your role requires TOTP two-factor authentication before using the admin panel.', 'setup' => 'Set up two-factor authentication', 'code_title' => 'Authentication code', 'code_description' => 'Enter the authentication code provided by your authenticator application.', 'recovery_title' => 'Recovery code', 'recovery_description' => 'Please confirm access to your account by entering one of your emergency recovery codes.', 'or' => 'or you can', 'recovery_placeholder' => 'Enter recovery code'],
    'confirm_password' => ['title' => 'Confirm password', 'description' => 'This is a secure area. Please confirm your password to continue.', 'submit' => 'Confirm password', 'passkey' => 'Confirm with passkey', 'passkey_loading' => 'Confirming…', 'or_password' => 'Or confirm with password'],
    'passkey' => ['sign_in' => 'Sign in with a passkey', 'authenticating' => 'Authenticating…', 'or_email' => 'Or continue with email', 'cancelled' => 'The passkey request was cancelled or timed out.', 'invalid_domain' => 'Passkeys cannot be used on this domain.'],
    'status' => ['pending_title' => 'Your membership is under review', 'pending_text' => 'You will be notified as soon as the admins approve your membership.', 'suspended_title' => 'Your membership is suspended', 'suspended_text' => 'Contact support for more information.', 'rejected_title' => 'Membership request rejected', 'expired_title' => 'Membership expired'],
];
