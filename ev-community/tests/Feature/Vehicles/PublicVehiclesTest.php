<?php

namespace Tests\Feature\Vehicles;

use App\Modules\Vehicles\Models\VehicleMake;
use App\Modules\Vehicles\Models\VehicleModel;
use App\Modules\Vehicles\Models\VehicleVariant;
use App\Modules\Vehicles\Services\SelectedVehicle;
use App\Modules\Vehicles\Services\VehicleDataService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class PublicVehiclesTest extends TestCase
{
    use RefreshDatabase;
    use VehicleFixtures;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_data_endpoint_is_localized_and_only_lists_active_records(): void
    {
        $make = VehicleMake::factory()->create(['name_ar' => 'بي واي دي', 'name_en' => 'BYD', 'slug' => 'byd']);
        $model = VehicleModel::factory()->create(['vehicle_make_id' => $make->id, 'name_ar' => 'أتو 3', 'name_en' => 'Atto 3']);
        VehicleModel::factory()->inactive()->create(['vehicle_make_id' => $make->id, 'name_en' => 'Hidden']);
        VehicleVariant::factory()->create(['vehicle_model_id' => $model->id, 'name_ar' => 'المدى الممتد', 'name_en' => 'Extended Range']);
        VehicleMake::factory()->inactive()->create();

        $this->getJson('/en/vehicles/data')->assertOk()
            ->assertJsonCount(1, 'makes')
            ->assertJsonPath('makes.0.name', 'BYD')
            ->assertJsonCount(1, 'makes.0.models')
            ->assertJsonPath('makes.0.models.0.name', 'Atto 3')
            ->assertJsonPath('makes.0.models.0.variants.0.name', 'Extended Range')
            ->assertJsonPath('market_versions.0.label', 'Chinese market')
            ->assertHeader('Cache-Control', 'max-age=300, public');

        $this->getJson('/ar/vehicles/data')->assertOk()
            ->assertJsonPath('makes.0.name', 'بي واي دي')
            ->assertJsonPath('makes.0.models.0.name', 'أتو 3')
            ->assertJsonPath('makes.0.models.0.variants.0.name', 'المدى الممتد')
            ->assertJsonPath('market_versions.0.label', 'السوق الصيني');
    }

    public function test_data_endpoint_is_cached_for_an_hour_per_locale(): void
    {
        $make = VehicleMake::factory()->create(['name_en' => 'Cached']);
        VehicleModel::factory()->create(['vehicle_make_id' => $make->id]);

        $this->getJson('/en/vehicles/data')->assertJsonPath('makes.0.name', 'Cached');
        $this->assertTrue(Cache::has(VehicleDataService::cacheKey('en')));
        $this->assertFalse(Cache::has(VehicleDataService::cacheKey('ar')));

        // a direct DB write (bypassing the admin service) is not visible until the cache expires or is flushed
        VehicleMake::query()->whereKey($make->id)->update(['name_en' => 'Changed']);
        $this->getJson('/en/vehicles/data')->assertJsonPath('makes.0.name', 'Cached');

        $this->travel(VehicleDataService::TTL_SECONDS + 1)->seconds();
        $this->getJson('/en/vehicles/data')->assertJsonPath('makes.0.name', 'Changed');

        VehicleMake::query()->whereKey($make->id)->update(['name_en' => 'Flushed']);
        app(VehicleDataService::class)->flush();
        $this->getJson('/en/vehicles/data')->assertJsonPath('makes.0.name', 'Flushed');
    }

    public function test_supported_vehicles_page_renders_for_guests(): void
    {
        $variant = $this->variant(['year_from' => 2021, 'year_to' => null]);

        $this->get('/en/vehicles')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('public/vehicles/index')
            ->has('makes', 1)
            ->where('makes.0.models.0.id', $variant->vehicle_model_id)
            ->where('makes.0.models.0.variants_count', 1)
            ->where('makes.0.models.0.years.from', 2021)
            ->where('makes.0.models.0.years.to', null)
            ->where('selectedVehicle', null));
    }

    public function test_guest_selection_is_kept_in_the_session_and_shared_with_every_page(): void
    {
        $variant = $this->variant();
        $model = $variant->model;

        $this->from('/en/vehicles')->post('/en/vehicles/select', [
            'make_id' => $model->vehicle_make_id,
            'model_id' => $model->id,
            'variant_id' => $variant->id,
            'year' => 2023,
        ])->assertRedirect('/en/vehicles')->assertSessionHas(SelectedVehicle::SESSION_KEY);

        $this->get('/en/vehicles')->assertInertia(fn (Assert $page) => $page
            ->where('selectedVehicle.source', 'session')
            ->where('selectedVehicle.model_id', $model->id)
            ->where('selectedVehicle.variant_id', $variant->id)
            ->where('selectedVehicle.year', 2023)
            ->where('selectedVehicle.vehicle_id', null));

        $this->getJson('/en/vehicles/selected')->assertJsonPath('data.make_id', $model->vehicle_make_id);

        $this->from('/en/vehicles')->delete('/en/vehicles/select')->assertRedirect('/en/vehicles');
        $this->get('/en/vehicles')->assertInertia(fn (Assert $page) => $page->where('selectedVehicle', null));
    }

    public function test_selection_is_validated(): void
    {
        $model = VehicleModel::factory()->create();
        $otherMake = VehicleMake::factory()->create();
        $inactiveModel = VehicleModel::factory()->inactive()->create(['vehicle_make_id' => $model->vehicle_make_id]);

        $this->postJson('/en/vehicles/select', ['make_id' => $otherMake->id, 'model_id' => $model->id])->assertJsonValidationErrors('model_id');
        $this->postJson('/en/vehicles/select', ['make_id' => $model->vehicle_make_id, 'model_id' => $inactiveModel->id])->assertJsonValidationErrors('model_id');
        $this->postJson('/en/vehicles/select', ['make_id' => $model->vehicle_make_id, 'model_id' => $model->id, 'year' => 1990])->assertJsonValidationErrors('year');

        $this->postJson('/en/vehicles/select', ['make_id' => $model->vehicle_make_id, 'model_id' => $model->id])
            ->assertOk()
            ->assertJsonPath('data.source', 'session')
            ->assertJsonPath('data.variant_id', null);
    }

    public function test_member_primary_garage_vehicle_wins_over_the_session_selection(): void
    {
        $member = $this->actingAsMember();
        $sessionModel = VehicleModel::factory()->create();
        $this->post('/en/vehicles/select', ['make_id' => $sessionModel->vehicle_make_id, 'model_id' => $sessionModel->id]);
        $this->get('/en/vehicles')->assertInertia(fn (Assert $page) => $page->where('selectedVehicle.source', 'session'));

        $garage = $this->vehicleFor($member, ['is_primary' => true, 'year' => 2022]);

        $this->get('/en/vehicles')->assertInertia(fn (Assert $page) => $page
            ->where('selectedVehicle.source', 'garage')
            ->where('selectedVehicle.vehicle_id', $garage->public_id)
            ->where('selectedVehicle.model_id', $garage->vehicle_model_id)
            ->where('selectedVehicle.year', 2022));

        // also available in the member portal
        $this->get('/account/garage')->assertInertia(fn (Assert $page) => $page->where('selectedVehicle.vehicle_id', $garage->public_id));
    }

    public function test_selected_vehicle_is_not_computed_in_the_admin_panel(): void
    {
        $this->actingAsStaff(['vehicles.view']);
        $this->get('/admin/vehicles')->assertInertia(fn (Assert $page) => $page->where('selectedVehicle', null));
    }
}
