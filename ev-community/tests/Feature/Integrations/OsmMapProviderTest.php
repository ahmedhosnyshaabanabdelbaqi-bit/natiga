<?php

namespace Tests\Feature\Integrations;

use App\Modules\Integrations\Contracts\Data\HealthStatus;
use App\Modules\Integrations\Drivers\Map\OsmMapProvider;
use App\Modules\Integrations\Models\IntegrationEvent;
use App\Modules\Integrations\Services\Integrations;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Sleep;
use Tests\TestCase;

class OsmMapProviderTest extends TestCase
{
    use RefreshDatabase;

    private const RATE_KEY = 'integrations:map:osm:nominatim';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Sleep::fake();
        Cache::flush();
        RateLimiter::clear(self::RATE_KEY);
        config(['ev.integrations.map.nominatim_rate_per_second' => 100]);
    }

    private function nominatimHit(): array
    {
        return [[
            'place_id' => 1, 'osm_type' => 'way', 'osm_id' => 42, 'lat' => '30.0444000', 'lon' => '31.2357000',
            'display_name' => 'Tahrir Square, Cairo, Egypt', 'class' => 'place', 'type' => 'square', 'importance' => 0.7,
            'address' => ['city' => 'Cairo', 'country' => 'Egypt', 'country_code' => 'eg'],
        ]];
    }

    public function test_geocode_returns_a_normalised_result_and_identifies_the_application(): void
    {
        Http::fake([OsmMapProvider::NOMINATIM_URL.'/search*' => Http::response($this->nominatimHit())]);

        $result = Integrations::map()->geocode('Tahrir Square, Cairo');

        $this->assertNotNull($result);
        $this->assertEqualsWithDelta(30.0444, $result->lat, 0.0001);
        $this->assertEqualsWithDelta(31.2357, $result->lng, 0.0001);
        $this->assertSame('EG', $result->countryCode);
        $this->assertSame('Cairo', $result->city);
        $this->assertSame('osm', $result->source);
        Http::assertSent(fn (Request $request) => str_contains($request->url(), '/search')
            && $request['countrycodes'] === 'eg'
            && $request['format'] === 'jsonv2'
            && str_starts_with((string) $request->header('User-Agent')[0], 'EVCommunityEgypt/')
            && $request->hasHeader('Referer'));
        $this->assertDatabaseHas('integration_events', ['provider' => 'map', 'operation' => 'geocode', 'status' => 'success']);
        $this->assertSame(1, RateLimiter::attempts(self::RATE_KEY), 'every Nominatim call goes through the rate limiter');
    }

    public function test_geocode_results_are_cached_by_normalised_address(): void
    {
        Http::fake([OsmMapProvider::NOMINATIM_URL.'/search*' => Http::response($this->nominatimHit())]);

        Integrations::map()->geocode('Tahrir Square, Cairo');
        Integrations::map()->geocode('  tahrir   square,  cairo ');

        Http::assertSentCount(1);
    }

    public function test_empty_results_are_cached_as_not_found(): void
    {
        Http::fake([OsmMapProvider::NOMINATIM_URL.'/search*' => Http::response([])]);

        $this->assertNull(Integrations::map()->geocode('nowhere at all'));
        $this->assertNull(Integrations::map()->geocode('nowhere at all'));
        Http::assertSentCount(1);
    }

    public function test_server_errors_return_null_without_throwing_and_are_not_cached(): void
    {
        Http::fake([OsmMapProvider::NOMINATIM_URL.'/search*' => Http::response('upstream down', 503)]);

        $this->assertNull(Integrations::map()->geocode('Tahrir Square, Cairo'));
        $this->assertNull(Integrations::map()->geocode('Tahrir Square, Cairo'));

        Http::assertSentCount(4); // 2 calls × (1 attempt + 1 retry on 5xx)
        $this->assertSame(2, IntegrationEvent::query()->where('provider', 'map')->where('operation', 'geocode')->where('status', 'failed')->count());
    }

    public function test_the_single_retry_respects_the_one_request_per_second_policy(): void
    {
        config(['ev.integrations.map.nominatim_rate_per_second' => 1]);
        Http::fake([OsmMapProvider::NOMINATIM_URL.'/search*' => Http::response('slow down', 429)]);

        $this->assertNull(Integrations::map()->geocode('Tahrir Square, Cairo'));

        Http::assertSentCount(2);
        Sleep::assertSlept(fn ($duration) => $duration->totalMilliseconds >= 1000, 1);
        Sleep::assertSleptTimes(1);
    }

    public function test_connection_timeouts_return_null_and_are_logged_as_timeout(): void
    {
        Http::fake(fn () => throw new ConnectionException('cURL error 28: Operation timed out after 10000 milliseconds'));

        $this->assertNull(Integrations::map()->geocode('Tahrir Square, Cairo'));
        $this->assertDatabaseHas('integration_events', ['provider' => 'map', 'operation' => 'geocode', 'status' => 'timeout']);
    }

    public function test_client_errors_are_not_retried(): void
    {
        Http::fake([OsmMapProvider::NOMINATIM_URL.'/search*' => Http::response('bad request', 400)]);

        $this->assertNull(Integrations::map()->geocode('Tahrir Square, Cairo'));
        Http::assertSentCount(1);
    }

    public function test_reverse_geocode_maps_the_response(): void
    {
        Http::fake([OsmMapProvider::NOMINATIM_URL.'/reverse*' => Http::response($this->nominatimHit()[0])]);

        $result = Integrations::map()->reverseGeocode(30.0444, 31.2357);

        $this->assertNotNull($result);
        $this->assertSame('Tahrir Square, Cairo, Egypt', $result->displayName);
        Http::assertSent(fn (Request $request) => str_contains($request->url(), '/reverse') && (string) $request['lat'] === '30.0444');
    }

    public function test_health_check_uses_the_status_endpoint(): void
    {
        Http::fake([OsmMapProvider::NOMINATIM_URL.'/status*' => Http::response(['status' => 0, 'message' => 'OK'])]);
        $this->assertSame(HealthStatus::Operational, Integrations::map()->healthCheck()->status);

        Http::fake(fn () => throw new ConnectionException('Could not resolve host'));
        $this->assertSame(HealthStatus::Unavailable, Integrations::map()->healthCheck()->status);
    }

    public function test_public_config_never_exposes_the_server_key(): void
    {
        config(['ev.map.server_key' => 'super-secret', 'ev.map.tile_url' => 'https://tiles.example/{z}/{x}/{y}.png']);

        $config = Integrations::map()->publicConfig();

        $this->assertSame('osm', $config['provider']);
        $this->assertSame('https://tiles.example/{z}/{x}/{y}.png', $config['tile_url']);
        $this->assertNull($config['public_key']);
        $this->assertStringNotContainsString('super-secret', json_encode($config));
    }

    public function test_the_configured_nominatim_url_is_used_for_every_call(): void
    {
        config(['ev.integrations.map.nominatim_url' => 'https://geo.internal.example/']);
        Http::fake([
            'https://geo.internal.example/search*' => Http::response($this->nominatimHit()),
            'https://geo.internal.example/status*' => Http::response(['status' => 0]),
        ]);

        $this->assertNotNull(Integrations::map()->geocode('Tahrir Square, Cairo'));
        $this->assertSame(HealthStatus::Operational, Integrations::map()->healthCheck()->status);

        Http::assertSent(fn (Request $request) => str_starts_with($request->url(), 'https://geo.internal.example/search?'));
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'nominatim.openstreetmap.org'));
    }

    public function test_cache_is_per_locale_because_nominatim_localises_the_display_name(): void
    {
        Http::fake([OsmMapProvider::NOMINATIM_URL.'/search*' => Http::response($this->nominatimHit())]);

        app()->setLocale('ar');
        Integrations::map()->geocode('Tahrir Square, Cairo');
        app()->setLocale('en');
        Integrations::map()->geocode('Tahrir Square, Cairo');
        Integrations::map()->geocode('Tahrir Square, Cairo');

        Http::assertSentCount(2);
        Http::assertSent(fn (Request $request) => $request['accept-language'] === 'ar');
        Http::assertSent(fn (Request $request) => $request['accept-language'] === 'en');
    }

    public function test_rate_limit_exhaustion_fails_gracefully_without_calling_nominatim(): void
    {
        config(['ev.integrations.map.nominatim_rate_per_second' => 1]);
        RateLimiter::hit(self::RATE_KEY, 60); // slot already taken and it does not free up (Sleep is faked)
        Http::fake([OsmMapProvider::NOMINATIM_URL.'/search*' => Http::response($this->nominatimHit())]);

        $this->assertNull(Integrations::map()->geocode('Tahrir Square, Cairo'));

        Http::assertNothingSent();
        Sleep::assertSleptTimes(1);
    }

    public function test_geometry_helpers_work_without_any_vendor(): void
    {
        $map = Integrations::map();
        $this->assertEqualsWithDelta(180.0, $map->distanceKm(30.0444, 31.2357, 31.2001, 29.9187), 2.0);
        $this->assertStringStartsWith('https://www.google.com/maps/dir/?api=1&destination=', $map->directionsUrl(30.0444, 31.2357));
    }
}
