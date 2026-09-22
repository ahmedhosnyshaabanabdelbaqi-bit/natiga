<?php

namespace Tests\Feature\Integrations;

use App\Modules\Integrations\Drivers\Map\OsmMapProvider;
use App\Modules\Integrations\Services\Integrations;
use App\Modules\Integrations\Services\OperationsExceptionsBridge;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Sleep;
use Tests\TestCase;

/**
 * Health checks raise / auto-resolve "integrations" exceptions in the Exception Center
 * (Reports/Operations) — only when that module is installed.
 */
class OperationsBridgeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        if (! OperationsExceptionsBridge::available()) {
            $this->markTestSkipped('Reports/Operations module is not installed.');
        }
        Http::preventStrayRequests();
        Sleep::fake();
        Cache::flush();
        RateLimiter::clear('integrations:map:osm:nominatim');
        config(['ev.integrations.map.nominatim_rate_per_second' => 100]);
    }

    /** @return array<string, mixed>|null */
    private function exceptionRow(string $key): ?array
    {
        $row = DB::table('operations_exceptions')->where('dedup_key', OperationsExceptionsBridge::dedupKey($key))->orderByDesc('id')->first();

        return $row ? (array) $row : null;
    }

    public function test_degraded_check_raises_one_deduplicated_p2_exception_and_recovery_resolves_it(): void
    {
        $healthy = false;
        Http::fake([OsmMapProvider::NOMINATIM_URL.'/status*' => function () use (&$healthy) {
            return $healthy ? Http::response(['status' => 0, 'message' => 'OK']) : Http::response('maintenance', 503);
        }]);

        Integrations::check('map');
        Integrations::check('map');

        $row = $this->exceptionRow('map');
        $this->assertNotNull($row);
        $this->assertSame('integrations', $row['category']);
        $this->assertSame('p2', $row['severity']);
        $this->assertSame('open', $row['status']);
        $this->assertSame(2, (int) $row['occurrences'], 'a recurring problem increments the same exception');
        $this->assertSame('integrations:check', $row['source']);
        $this->assertSame(1, DB::table('operations_exceptions')->where('dedup_key', 'integration:map')->count());

        $healthy = true;
        Integrations::check('map');

        $row = $this->exceptionRow('map');
        $this->assertSame('resolved', $row['status']);
        $this->assertNotNull($row['resolved_at']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'operations.exception_resolved', 'entity_id' => $row['id'], 'actor_type' => 'system']);
    }

    public function test_unavailable_check_raises_a_p1_exception(): void
    {
        Http::fake(fn () => throw new ConnectionException('Could not resolve host'));

        Integrations::check('map');

        $this->assertSame('p1', $this->exceptionRow('map')['severity']);
    }

    public function test_deliberately_unconfigured_integrations_are_not_incidents(): void
    {
        Integrations::check('payment'); // PAYMENT_PROVIDER=none → not_configured

        $this->assertNull($this->exceptionRow('payment'));
    }

    public function test_a_failing_exception_center_never_breaks_the_health_check(): void
    {
        $this->app->bind(OperationsExceptionsBridge::SERVICE, fn () => new class
        {
            public function raise(): never
            {
                throw new \RuntimeException('exception center down');
            }
        });
        Http::fake([OsmMapProvider::NOMINATIM_URL.'/status*' => Http::response('maintenance', 503)]);

        $result = Integrations::check('map');

        $this->assertSame('degraded', $result->status->value);
        $this->assertDatabaseHas('integration_providers', ['key' => 'map', 'status' => 'degraded']);
    }
}
