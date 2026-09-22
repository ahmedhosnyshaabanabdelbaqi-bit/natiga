<?php

namespace Tests\Feature\Notifications\Support;

use App\Models\User;
use App\Modules\Integrations\Services\IntegrationManager;
use App\Modules\Integrations\Services\Integrations;
use App\Modules\Notifications\Models\Enums\NotificationChannel;
use App\Modules\Notifications\Services\MarketingConsent;
use Illuminate\Support\Facades\Cache;

trait InteractsWithNotifications
{
    protected function setUpNotifications(): void
    {
        Cache::flush();
        FakeSmsProvider::$sent = [];
        FakeSmsProvider::$failWith = null;
        FakeWhatsAppProvider::$sent = [];
        config(['ev.integrations.email.force_configured' => false, 'ev.integrations.sms.driver' => 'none', 'ev.integrations.whatsapp.driver' => 'none']);
        app(IntegrationManager::class)->forget();
    }

    protected function emailConfigured(bool $configured = true): void
    {
        config(['ev.integrations.email.force_configured' => $configured]);
        app(IntegrationManager::class)->forget('email');
    }

    protected function smsConfigured(): void
    {
        Integrations::extend('sms', 'fake', FakeSmsProvider::class);
        config(['ev.integrations.sms.driver' => 'fake']);
        app(IntegrationManager::class)->forget('sms');
    }

    protected function whatsappConfigured(): void
    {
        Integrations::extend('whatsapp', 'fake', FakeWhatsAppProvider::class);
        config(['ev.integrations.whatsapp.driver' => 'fake']);
        app(IntegrationManager::class)->forget('whatsapp');
    }

    protected function grantConsent(User $user, NotificationChannel $channel): void
    {
        MarketingConsent::grant($user, $channel, 'web');
    }
}
