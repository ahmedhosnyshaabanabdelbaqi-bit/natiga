<?php

namespace Tests\Feature\Integrations;

use App\Modules\Integrations\Drivers\Map\OsmMapProvider;
use App\Modules\Integrations\Models\IntegrationProvider;
use App\Modules\Integrations\Services\IntegrationManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Sleep;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class AdminIntegrationsPageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Sleep::fake();
        Cache::flush();
        RateLimiter::clear('integrations:map:osm:nominatim');
        config(['ev.integrations.map.nominatim_rate_per_second' => 100]);
        Http::fake([
            OsmMapProvider::NOMINATIM_URL.'/status*' => Http::response(['status' => 0, 'message' => 'OK']),
            OsmMapProvider::NOMINATIM_URL.'/search*' => Http::response([['lat' => '30.0444', 'lon' => '31.2357', 'display_name' => 'Tahrir Square, Cairo, Egypt', 'address' => ['city' => 'Cairo', 'country_code' => 'eg']]]),
        ]);
    }

    public function test_guests_and_staff_without_permission_cannot_open_the_page(): void
    {
        $this->get('/admin/integrations')->assertRedirect(config('ev.portals.admin.login'));

        $this->actingAsStaff([]);
        $this->get('/admin/integrations')->assertForbidden();
    }

    public function test_viewer_sees_the_status_matrix_without_management_actions(): void
    {
        $this->actingAsStaff(['integrations.view']);

        $this->get('/admin/integrations')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/integrations/index')
                ->has('matrix', count(IntegrationManager::CATEGORIES))
                ->where('matrix.0.key', 'payment')
                ->where('matrix.0.status', 'not_configured')
                ->where('matrix.0.configured', false)
                ->where('email.configured', false)
                ->where('email.mailer', 'array')
                ->where('map.configured', true)
                ->where('canManage', false)
                ->has('recentEvents')
                ->has('webhookSummary.received'));

        $this->post(route('admin.integrations.check', ['key' => 'payment']))->assertForbidden();
        $this->post(route('admin.integrations.geocode-test'), ['address' => 'Tahrir Square'])->assertForbidden();
    }

    public function test_owner_passes_every_gate(): void
    {
        $this->actingAsRole('owner');
        $this->get('/admin/integrations')->assertOk();
        $this->get('/admin/integrations/exchange-rates')->assertOk();
        $this->get('/admin/integrations/webhook-events')->assertOk();
    }

    public function test_manager_can_run_a_single_check_and_all_checks(): void
    {
        $this->actingAsStaff(['integrations.view', 'integrations.manage']);

        $this->from('/admin/integrations')->post(route('admin.integrations.check', ['key' => 'map']))
            ->assertRedirect('/admin/integrations')
            ->assertSessionHas('success');
        $this->assertDatabaseHas('integration_providers', ['key' => 'map', 'status' => 'operational']);

        $this->post(route('admin.integrations.check', ['key' => 'all']))->assertRedirect();
        $this->assertSame(count(IntegrationManager::CATEGORIES), IntegrationProvider::query()->count());

        $this->post(route('admin.integrations.check', ['key' => 'unknown_thing']))->assertNotFound();

        $this->get('/admin/integrations')->assertInertia(fn (Assert $page) => $page
            ->where('matrix.1.key', 'map')
            ->where('matrix.1.status', 'operational')
            ->whereNot('matrix.1.last_checked_at', null));
    }

    public function test_geocode_test_shows_the_resolved_result(): void
    {
        $this->actingAsStaff(['integrations.view', 'integrations.manage']);

        $this->followingRedirects()
            ->from('/admin/integrations')
            ->post(route('admin.integrations.geocode-test'), ['address' => 'Tahrir Square, Cairo'])
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/integrations/index')
                ->where('geocodeResult.found', true)
                ->where('geocodeResult.result.city', 'Cairo')
                ->where('geocodeResult.directions_url', 'https://www.google.com/maps/dir/?api=1&destination=30.0444%2C31.2357&travelmode=driving'));

        $this->post(route('admin.integrations.geocode-test'), ['address' => 'ab'])->assertSessionHasErrors('address');
    }

    public function test_geocode_test_is_refused_when_the_map_provider_is_not_configured(): void
    {
        config(['ev.integrations.map.driver' => 'none']);
        $this->actingAsStaff(['integrations.view', 'integrations.manage']);

        $this->from('/admin/integrations')->post(route('admin.integrations.geocode-test'), ['address' => 'Tahrir Square, Cairo'])
            ->assertRedirect('/admin/integrations')
            ->assertSessionHas('warning');
        Http::assertNothingSent();
    }
}
