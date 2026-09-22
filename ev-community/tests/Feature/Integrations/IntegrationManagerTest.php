<?php

namespace Tests\Feature\Integrations;

use App\Modules\Integrations\Contracts\Data\HealthStatus;
use App\Modules\Integrations\Contracts\Data\SendStatus;
use App\Modules\Integrations\Contracts\Data\SmsMessage;
use App\Modules\Integrations\Contracts\MapProvider;
use App\Modules\Integrations\Contracts\PaymentProvider;
use App\Modules\Integrations\Drivers\Charging\NotConfiguredChargingProvider;
use App\Modules\Integrations\Drivers\Email\LaravelMailEmailProvider;
use App\Modules\Integrations\Drivers\ExchangeRate\ManualExchangeRateProvider;
use App\Modules\Integrations\Drivers\Map\OsmMapProvider;
use App\Modules\Integrations\Drivers\Payment\NotConfiguredPaymentProvider;
use App\Modules\Integrations\Drivers\Shipping\ManualShippingProvider;
use App\Modules\Integrations\Drivers\Sms\LogSmsProvider;
use App\Modules\Integrations\Drivers\Sms\NotConfiguredSmsProvider;
use App\Modules\Integrations\Drivers\WhatsApp\NotConfiguredWhatsAppProvider;
use App\Modules\Integrations\Exceptions\IntegrationNotConfiguredException;
use App\Modules\Integrations\Models\IntegrationEvent;
use App\Modules\Integrations\Models\IntegrationProvider;
use App\Modules\Integrations\Services\IntegrationManager;
use App\Modules\Integrations\Services\Integrations;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Feature\Integrations\Support\FakePaymentProvider;
use Tests\TestCase;

class IntegrationManagerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Http::fake([OsmMapProvider::NOMINATIM_URL.'/status*' => Http::response(['status' => 0, 'message' => 'OK'])]);
    }

    public function test_default_drivers_resolve_to_not_configured_or_manual_never_to_a_fake_vendor(): void
    {
        $this->assertInstanceOf(NotConfiguredPaymentProvider::class, Integrations::payment());
        $this->assertInstanceOf(NotConfiguredSmsProvider::class, Integrations::sms());
        $this->assertInstanceOf(NotConfiguredWhatsAppProvider::class, Integrations::whatsapp());
        $this->assertInstanceOf(NotConfiguredChargingProvider::class, Integrations::charging());
        $this->assertInstanceOf(ManualShippingProvider::class, Integrations::shipping());
        $this->assertInstanceOf(ManualExchangeRateProvider::class, Integrations::exchangeRate());
        $this->assertInstanceOf(OsmMapProvider::class, Integrations::map());
        $this->assertInstanceOf(LaravelMailEmailProvider::class, Integrations::email());
        $this->assertFalse(Integrations::isConfigured('email'), 'MAIL_MAILER=array must not count as configured');
    }

    public function test_status_reports_not_configured_and_a_fallback_for_unconfigured_categories(): void
    {
        foreach (['payment', 'sms', 'whatsapp', 'charging', 'email'] as $key) {
            $status = Integrations::status($key);
            $this->assertSame('not_configured', $status['status'], $key);
            $this->assertFalse($status['configured']);
            $this->assertNotSame('', $status['fallback']);
            $this->assertNull($status['last_checked_at']);
        }
        $this->assertSame('unknown', Integrations::status('map')['status'], 'configured but never checked');
    }

    public function test_not_configured_drivers_throw_a_translatable_domain_exception(): void
    {
        $this->expectException(IntegrationNotConfiguredException::class);
        Integrations::sms()->send(new SmsMessage('01000000000', 'hello'));
    }

    public function test_check_upserts_the_provider_row_and_records_an_integration_event(): void
    {
        $result = Integrations::check('payment');
        $this->assertSame(HealthStatus::NotConfigured, $result->status);

        $row = IntegrationProvider::query()->find('payment');
        $this->assertNotNull($row);
        $this->assertSame(HealthStatus::NotConfigured, $row->status);
        $this->assertSame('none', $row->driver);
        $this->assertNotNull($row->last_checked_at);
        $this->assertNull($row->last_success_at);
        $this->assertDatabaseHas('integration_events', ['provider' => 'payment', 'operation' => 'health_check', 'direction' => 'outbound']);

        Integrations::check('payment');
        $this->assertSame(1, IntegrationProvider::query()->where('key', 'payment')->count(), 'upsert, not insert');
        $this->assertSame(2, IntegrationEvent::query()->where('provider', 'payment')->count());
    }

    public function test_operational_check_sets_last_success_and_is_visible_in_status(): void
    {
        $result = Integrations::check('map');
        $this->assertSame(HealthStatus::Operational, $result->status);
        $status = Integrations::status('map');
        $this->assertSame('operational', $status['status']);
        $this->assertNotNull($status['last_success_at']);
        $this->assertNull($status['last_error']);
    }

    public function test_unknown_driver_is_treated_as_not_configured_with_a_visible_note(): void
    {
        config(['ev.integrations.sms.driver' => 'acme']);
        Integrations::manager()->forget('sms');

        $this->assertInstanceOf(NotConfiguredSmsProvider::class, Integrations::sms());
        $this->assertFalse(Integrations::isConfigured('sms'));
        $status = Integrations::status('sms');
        $this->assertSame('not_configured', $status['status']);
        $this->assertStringContainsString('acme', $status['driver']);
        $this->assertStringContainsString('acme', (string) $status['last_error']);
    }

    public function test_log_sms_driver_works_outside_production_and_reports_logged_not_sent(): void
    {
        config(['ev.integrations.sms.driver' => 'log']);
        Integrations::manager()->forget('sms');

        $this->assertInstanceOf(LogSmsProvider::class, Integrations::sms());
        $this->assertTrue(Integrations::isConfigured('sms'));
        $result = Integrations::sms()->send(new SmsMessage('01012345678', 'Your OTP is 123456', 'otp:1'));
        $this->assertSame(SendStatus::Logged, $result->status);
        $this->assertFalse($result->status->isDelivered());
        $this->assertDatabaseHas('integration_events', ['provider' => 'sms', 'operation' => 'send', 'status' => 'success', 'reference' => 'otp:1']);
        $this->assertSame(HealthStatus::Degraded, Integrations::check('sms')->status, 'a log driver is never reported as fully operational');
    }

    public function test_log_driver_is_refused_in_production(): void
    {
        config(['ev.integrations.whatsapp.driver' => 'log']);
        $this->app['env'] = 'production';
        try {
            Integrations::manager()->forget('whatsapp');
            $this->assertInstanceOf(NotConfiguredWhatsAppProvider::class, Integrations::whatsapp());
            $this->assertFalse(Integrations::isConfigured('whatsapp'));
            $this->assertNotNull(Integrations::status('whatsapp')['last_error']);
        } finally {
            $this->app['env'] = 'testing';
            Integrations::manager()->forget('whatsapp');
        }
    }

    public function test_category_contracts_are_injectable_from_the_container(): void
    {
        $this->assertInstanceOf(OsmMapProvider::class, app(MapProvider::class));
        $this->assertInstanceOf(NotConfiguredPaymentProvider::class, app(PaymentProvider::class));
    }

    public function test_vendor_drivers_are_registered_through_extend(): void
    {
        Integrations::extend('payment', 'fake', FakePaymentProvider::class);
        config(['ev.integrations.payment.driver' => 'fake']);
        Integrations::manager()->forget('payment');

        $this->assertInstanceOf(FakePaymentProvider::class, Integrations::payment());
        $this->assertTrue(Integrations::isConfigured('payment'));
        $this->assertTrue(Integrations::manager()->acceptsWebhooks('payment'));
        $this->assertSame(['payment'], Integrations::manager()->webhookProviders());
        $row = collect(Integrations::matrix())->firstWhere('key', 'payment');
        $this->assertStringEndsWith('/webhooks/payment', (string) $row['webhook_url']);
    }

    public function test_extend_rejects_classes_that_do_not_implement_the_contract(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        Integrations::extend('payment', 'bad', OsmMapProvider::class);
    }

    public function test_matrix_has_one_row_per_category_with_docs_env_and_fallback(): void
    {
        $matrix = Integrations::matrix();
        $this->assertCount(count(IntegrationManager::CATEGORIES), $matrix);
        foreach ($matrix as $row) {
            $this->assertArrayHasKey('name', $row);
            $this->assertArrayHasKey('fallback', $row);
            $this->assertStringStartsWith('docs/modules/integrations.md#', $row['docs']);
            $this->assertNotEmpty($row['env']);
            $this->assertArrayNotHasKey('server_key', $row['public_config']);
        }
        $this->assertNull(collect($matrix)->firstWhere('key', 'shipping')['webhook_url'], 'manual shipping accepts no webhooks');
    }

    public function test_console_command_checks_one_or_all_integrations(): void
    {
        $this->artisan('integrations:check', ['key' => 'payment'])->assertExitCode(0);
        $this->assertDatabaseHas('integration_providers', ['key' => 'payment', 'status' => 'not_configured']);

        $this->artisan('integrations:check', ['--json' => true])->assertExitCode(0);
        $this->assertSame(count(IntegrationManager::CATEGORIES), IntegrationProvider::query()->count());

        $this->artisan('integrations:check', ['key' => 'nope'])->assertExitCode(2);
    }
}
