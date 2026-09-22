<?php

namespace App\Modules\Integrations;

use App\Modules\Integrations\Drivers\Charging\NotConfiguredChargingProvider;
use App\Modules\Integrations\Drivers\Email\LaravelMailEmailProvider;
use App\Modules\Integrations\Drivers\Email\NotConfiguredEmailProvider;
use App\Modules\Integrations\Drivers\ExchangeRate\ManualExchangeRateProvider;
use App\Modules\Integrations\Drivers\ExchangeRate\NotConfiguredExchangeRateProvider;
use App\Modules\Integrations\Drivers\Map\NotConfiguredMapProvider;
use App\Modules\Integrations\Drivers\Map\OsmMapProvider;
use App\Modules\Integrations\Drivers\Payment\NotConfiguredPaymentProvider;
use App\Modules\Integrations\Drivers\Shipping\ManualShippingProvider;
use App\Modules\Integrations\Drivers\Shipping\NotConfiguredShippingProvider;
use App\Modules\Integrations\Drivers\Sms\LogSmsProvider;
use App\Modules\Integrations\Drivers\Sms\NotConfiguredSmsProvider;
use App\Modules\Integrations\Drivers\WhatsApp\LogWhatsAppProvider;
use App\Modules\Integrations\Drivers\WhatsApp\NotConfiguredWhatsAppProvider;
use App\Modules\Integrations\Services\IntegrationManager;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Contracts\Container\Container;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class IntegrationsServiceProvider extends ServiceProvider
{
    /**
     * Driver map: config('ev.integrations.<category>.driver') → class. '*' matches any driver name
     * (the email category delegates to the framework mailer, whatever MAIL_MAILER is).
     * Vendor drivers (Paymob, Fawry, Bosta, ...) register themselves with
     * `Integrations::extend('payment', 'paymob', PaymobPaymentProvider::class)` — see docs/modules/integrations.md.
     *
     * @var array<string, array<string, class-string>>
     */
    public const DRIVERS = [
        'payment' => ['none' => NotConfiguredPaymentProvider::class],
        'map' => ['none' => NotConfiguredMapProvider::class, 'osm' => OsmMapProvider::class],
        'email' => ['none' => NotConfiguredEmailProvider::class, '*' => LaravelMailEmailProvider::class],
        'sms' => ['none' => NotConfiguredSmsProvider::class, 'log' => LogSmsProvider::class],
        'whatsapp' => ['none' => NotConfiguredWhatsAppProvider::class, 'log' => LogWhatsAppProvider::class],
        'shipping' => ['none' => NotConfiguredShippingProvider::class, 'manual' => ManualShippingProvider::class],
        'charging' => ['none' => NotConfiguredChargingProvider::class],
        'exchange_rate' => ['none' => NotConfiguredExchangeRateProvider::class, 'manual' => ManualExchangeRateProvider::class],
    ];

    public function register(): void
    {
        $this->app->singleton(IntegrationManager::class, function (Container $app) {
            $manager = new IntegrationManager($app);
            foreach (self::DRIVERS as $category => $drivers) {
                foreach ($drivers as $name => $class) {
                    $manager->extend($category, $name, $class);
                }
            }

            return $manager;
        });

        // Category contracts are injectable: `public function __construct(private MapProvider $map)`.
        foreach (IntegrationManager::CONTRACTS as $category => $contract) {
            $this->app->bind($contract, fn (Container $app) => $app->make(IntegrationManager::class)->resolve($category));
        }
    }

    public function boot(): void
    {
        RateLimiter::for('integrations-tests', fn (Request $request) => Limit::perMinute(10)->by($request->user()?->id ?: $request->ip()));

        $this->callAfterResolving(Schedule::class, function (Schedule $schedule) {
            $schedule->command('integrations:check')->hourly()->withoutOverlapping()->runInBackground();
        });
    }
}
