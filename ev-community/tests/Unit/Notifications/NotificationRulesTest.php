<?php

namespace Tests\Unit\Notifications;

use App\Modules\Notifications\Jobs\SendSmsNotification;
use App\Modules\Notifications\Models\Enums\NotificationChannel;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Services\AnnouncementService;
use App\Modules\Notifications\Services\NotificationPreferences;
use App\Modules\Notifications\Services\TemplateRegistry;
use App\Modules\Notifications\Support\NotificationUrl;
use Tests\TestCase;

class NotificationRulesTest extends TestCase
{
    public function test_url_sanitizer(): void
    {
        $this->assertSame('/account/orders', NotificationUrl::sanitize('/account/orders'));
        $this->assertSame('https://ev.example/a?b=1', NotificationUrl::sanitize(' https://ev.example/a?b=1 '));
        foreach (['//evil.example', '/\\evil.example', 'javascript:alert(1)', 'http://ev.example', 'account/orders', '', 'https://', "/a\nb", 'https://exa mple.com'] as $bad) {
            $this->assertNull(NotificationUrl::sanitize($bad), $bad);
        }
        config(['app.url' => 'https://ev.example/']);
        $this->assertSame('https://ev.example/account/x', NotificationUrl::absolute('/account/x'));
        $this->assertSame('https://ev.example/account/notifications', NotificationUrl::absolute(null));
        $this->assertSame('https://partner.example/deal', NotificationUrl::absolute('https://partner.example/deal'));
    }

    public function test_channel_consent_rules(): void
    {
        $this->assertFalse(NotificationChannel::InApp->requiresConsent(false));
        $this->assertFalse(NotificationChannel::Email->requiresConsent(true));
        $this->assertTrue(NotificationChannel::Email->requiresConsent(false));
        $this->assertTrue(NotificationChannel::Sms->requiresConsent(true));
        $this->assertTrue(NotificationChannel::WhatsApp->requiresConsent(true));
    }

    public function test_locked_and_default_preferences(): void
    {
        $this->assertTrue(NotificationPreferences::isLocked('orders', NotificationChannel::InApp));
        $this->assertTrue(NotificationPreferences::isLocked('payments', NotificationChannel::Email));
        $this->assertFalse(NotificationPreferences::isLocked('orders', NotificationChannel::Sms));
        $this->assertFalse(NotificationPreferences::isLocked('marketing', NotificationChannel::Email));
        $this->assertTrue(NotificationPreferences::defaultFor('marketing', NotificationChannel::InApp));
        $this->assertFalse(NotificationPreferences::defaultFor('marketing', NotificationChannel::Email));
        $this->assertTrue(NotificationPreferences::defaultFor('pickup', NotificationChannel::Sms));
        $this->assertCount(11, NotificationPreferences::categories());
    }

    public function test_template_registry_discovers_nested_keys_and_registered_keys(): void
    {
        $this->assertTrue(TemplateRegistry::has('orders.confirmed'));
        $this->assertTrue(TemplateRegistry::has('members.status.active'));
        $this->assertFalse(TemplateRegistry::has('members.status'));
        $this->assertContains('order_number', TemplateRegistry::variablesFor('orders.confirmed'));
        $this->assertContains('member_name', TemplateRegistry::variablesFor('orders.confirmed'));

        TemplateRegistry::register('group_buying.closed', ['reference', 'deadline'], 'group_buying', 'notifications.center.generic_title', 'notifications.center.empty_hint');
        try {
            $this->assertTrue(TemplateRegistry::has('group_buying.closed'));
            $this->assertSame('group_buying', TemplateRegistry::moduleFor('group_buying.closed'));
            $this->assertContains('deadline', TemplateRegistry::variablesFor('group_buying.closed'));
            $this->assertSame('New notification', TemplateRegistry::defaults('group_buying.closed', 'en')['subject']);
        } finally {
            TemplateRegistry::reset();
        }
    }

    public function test_member_numbers_parsing(): void
    {
        $this->assertSame(['EV-000001', 'EV-000002', 'EV-000003'], AnnouncementService::parseMemberNumbers(" ev-000001\nEV-000002, EV-000002;EV-000003 ، "));
        $this->assertSame(['EV-1'], AnnouncementService::parseMemberNumbers(['ev-1', '', 'EV-1']));
    }

    public function test_sms_body_fits_the_limit_and_keeps_the_link(): void
    {
        config(['app.url' => 'https://ev.example']);
        $notification = new Notification(['title' => 'Title', 'body' => str_repeat('x', 1000), 'url' => '/account/orders/01ABC']);

        $body = SendSmsNotification::body($notification);

        $this->assertLessThanOrEqual(SendSmsNotification::MAX_LENGTH, mb_strlen($body));
        $this->assertStringEndsWith('https://ev.example/account/orders/01ABC', $body);
    }
}
