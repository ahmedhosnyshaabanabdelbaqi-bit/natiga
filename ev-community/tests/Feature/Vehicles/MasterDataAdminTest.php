<?php

namespace Tests\Feature\Vehicles;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Files\Models\Attachment;
use App\Modules\Vehicles\Models\BatteryVariant;
use App\Modules\Vehicles\Models\ConnectorCompatibilityRule;
use App\Modules\Vehicles\Models\ConnectorType;
use App\Modules\Vehicles\Models\Enums\Compatibility;
use App\Modules\Vehicles\Models\VehicleMake;
use App\Modules\Vehicles\Models\VehicleModel;
use App\Modules\Vehicles\Models\VehicleVariant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class MasterDataAdminTest extends TestCase
{
    use RefreshDatabase;
    use VehicleFixtures;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake((string) config('filesystems.public_disk', 'public'));
        Storage::fake((string) config('filesystems.private_disk', 'private'));
    }

    public function test_pages_need_vehicles_view_or_manage_master(): void
    {
        $this->get('/admin/vehicles')->assertRedirect();

        $this->actingAsStaff([]);
        foreach (['/admin/vehicles', '/admin/vehicles/models', '/admin/vehicles/variants', '/admin/vehicles/connectors'] as $url) {
            $this->get($url)->assertForbidden();
        }
    }

    public function test_viewer_sees_every_master_data_page_read_only(): void
    {
        $this->actingAsStaff(['vehicles.view']);
        $variant = $this->variant();

        $this->get('/admin/vehicles')->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/vehicles/makes')->has('makes', 1)->where('canManage', false));
        $this->get('/admin/vehicles/models?make='.$variant->model->vehicle_make_id)->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/vehicles/models')->has('models', 1)->where('filters.make', $variant->model->vehicle_make_id));
        $this->get('/admin/vehicles/variants?model='.$variant->vehicle_model_id)->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/vehicles/variants')->has('variants', 1)->where('filters.make', $variant->model->vehicle_make_id));
        $this->get('/admin/vehicles/connectors')->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/vehicles/connectors')->has('connectors', 6)->where('canManage', false));
    }

    public function test_master_data_writes_need_vehicles_manage_master(): void
    {
        $this->actingAsStaff(['vehicles.view']);
        $variant = $this->variant();
        $make = $variant->model->make;
        $connector = ConnectorType::query()->where('code', 'type2')->sole();

        $this->post('/admin/vehicles/makes', ['name_ar' => 'س', 'name_en' => 'X'])->assertForbidden();
        $this->put("/admin/vehicles/makes/{$make->id}", ['name_ar' => 'س', 'name_en' => 'X'])->assertForbidden();
        $this->post("/admin/vehicles/makes/{$make->id}/toggle")->assertForbidden();
        $this->delete("/admin/vehicles/makes/{$make->id}")->assertForbidden();
        $this->post('/admin/vehicles/models', ['vehicle_make_id' => $make->id, 'name_ar' => 'م', 'name_en' => 'M'])->assertForbidden();
        $this->post('/admin/vehicles/variants', [])->assertForbidden();
        $this->delete("/admin/vehicles/variants/{$variant->id}")->assertForbidden();
        $this->post('/admin/vehicles/batteries', ['name' => 'B', 'capacity_kwh' => 50])->assertForbidden();
        $this->post('/admin/vehicles/connectors', ['code' => 'x', 'name_ar' => 'x', 'name_en' => 'x', 'current_type' => 'ac'])->assertForbidden();
        $this->post("/admin/vehicles/connectors/{$connector->id}/toggle")->assertForbidden();
        $this->put('/admin/vehicles/compatibility', ['rules' => []])->assertForbidden();

        $this->assertSame(1, VehicleMake::query()->count());
        $this->assertTrue($make->fresh()->is_active);
        $this->assertSame(0, AuditLog::query()->where('action', 'vehicles.master_changed')->count());
    }

    public function test_manager_creates_updates_toggles_and_deletes_a_make_with_logo_and_every_change_is_audited(): void
    {
        $this->actingAsStaff(['vehicles.manage_master']);

        $this->post('/admin/vehicles/makes', [
            'name_ar' => 'بي واي دي',
            'name_en' => 'BYD',
            'country_code' => 'cn',
            'is_active' => 1,
            'logo' => UploadedFile::fake()->image('byd.png', 200, 200),
        ])->assertSessionHasNoErrors()->assertRedirect();

        $make = VehicleMake::query()->sole();
        $this->assertSame('byd', $make->slug);
        $this->assertSame('CN', $make->country_code);
        $this->assertNotNull($make->logo_path);
        $logo = Attachment::query()->where('storage_path', $make->logo_path)->sole();
        $this->assertSame(Attachment::VISIBILITY_PUBLIC, $logo->visibility);
        $this->assertNotNull($make->logoUrl());

        $this->put("/admin/vehicles/makes/{$make->id}", ['name_ar' => 'بي واي دي', 'name_en' => 'BYD Auto', 'slug' => 'byd', 'remove_logo' => 1])->assertSessionHasNoErrors();
        $make->refresh();
        $this->assertSame('BYD Auto', $make->name_en);
        $this->assertNull($make->logo_path);
        $this->assertModelMissing($logo);

        $this->post("/admin/vehicles/makes/{$make->id}/toggle")->assertRedirect();
        $this->assertFalse($make->fresh()->is_active);

        $this->delete("/admin/vehicles/makes/{$make->id}")->assertRedirect();
        $this->assertModelMissing($make);

        $this->assertSame(4, AuditLog::query()->where('action', 'vehicles.master_changed')->count());
    }

    public function test_records_in_use_cannot_be_deleted(): void
    {
        $this->actingAsStaff(['vehicles.manage_master']);
        $variant = $this->variant();
        $this->vehicleFor($this->makeMember(), ['vehicle_make_id' => $variant->model->vehicle_make_id, 'vehicle_model_id' => $variant->vehicle_model_id, 'vehicle_variant_id' => $variant->id]);

        $this->delete("/admin/vehicles/makes/{$variant->model->vehicle_make_id}")->assertSessionHasErrors('domain');
        $this->delete("/admin/vehicles/models/{$variant->vehicle_model_id}")->assertSessionHasErrors('domain');
        $this->delete("/admin/vehicles/variants/{$variant->id}")->assertSessionHasErrors('domain');
        $this->assertModelExists($variant);
    }

    public function test_model_with_member_vehicles_cannot_be_moved_to_another_make(): void
    {
        $this->actingAsStaff(['vehicles.manage_master']);
        $model = VehicleModel::factory()->create();
        $this->vehicleFor($this->makeMember(), ['vehicle_make_id' => $model->vehicle_make_id, 'vehicle_model_id' => $model->id]);
        $otherMake = VehicleMake::factory()->create();

        $this->put("/admin/vehicles/models/{$model->id}", ['vehicle_make_id' => $otherMake->id, 'name_ar' => 'م', 'name_en' => 'Renamed'])
            ->assertSessionHasErrors('vehicle_make_id');
        $this->assertSame($model->vehicle_make_id, $model->fresh()->vehicle_make_id);

        // renaming in place is fine
        $this->put("/admin/vehicles/models/{$model->id}", ['vehicle_make_id' => $model->vehicle_make_id, 'name_ar' => 'م', 'name_en' => 'Renamed', 'body_type' => 'sedan'])
            ->assertSessionHasNoErrors();
        $this->assertSame('Renamed', $model->fresh()->name_en);
    }

    public function test_variant_validation_and_capacity_from_battery_pack(): void
    {
        $this->actingAsStaff(['vehicles.manage_master']);
        $c = $this->connectors();
        $model = VehicleModel::factory()->create();
        $battery = BatteryVariant::factory()->create(['capacity_kwh' => '60.48']);

        $this->post('/admin/vehicles/variants', [
            'vehicle_model_id' => $model->id, 'name_ar' => 'ف', 'name_en' => 'V', 'market_version' => 'china', 'year_from' => 2024, 'year_to' => 2022,
            'ac_connector_type_id' => $c['ccs2']->id,
        ])->assertSessionHasErrors(['year_to', 'ac_connector_type_id']);

        $this->post('/admin/vehicles/variants', [
            'vehicle_model_id' => $model->id, 'name_ar' => 'ف', 'name_en' => 'Plus', 'market_version' => 'china', 'year_from' => 2022,
            'battery_variant_id' => $battery->id, 'ac_connector_type_id' => $c['gbt_ac']->id, 'dc_connector_type_id' => $c['gbt_dc']->id,
        ])->assertSessionHasNoErrors();

        $variant = VehicleVariant::query()->sole();
        $this->assertSame('60.48', $variant->battery_capacity_kwh);
        $this->assertSame($c['gbt_dc']->id, $variant->dc_connector_type_id);
    }

    public function test_compatibility_matrix_editor_records_who_verified_each_rule(): void
    {
        $manager = $this->actingAsStaff(['vehicles.manage_master']);
        $c = $this->connectors();
        $this->rule($c['type2'], $c['gbt_ac'], Compatibility::Adapter);

        $this->put('/admin/vehicles/compatibility', ['rules' => [
            // unchanged value: staff confirms (verifies) the seeded rule
            ['vehicle_connector_type_id' => $c['type2']->id, 'station_connector_type_id' => $c['gbt_ac']->id, 'compatibility' => 'adapter', 'adapter_name' => 'GB/T → Type 2'],
            // new rule
            ['vehicle_connector_type_id' => $c['ccs2']->id, 'station_connector_type_id' => $c['gbt_dc']->id, 'compatibility' => 'incompatible', 'adapter_name' => 'ignored for incompatible'],
        ]])->assertSessionHasNoErrors()->assertRedirect();

        $adapter = ConnectorCompatibilityRule::query()->where('vehicle_connector_type_id', $c['type2']->id)->where('station_connector_type_id', $c['gbt_ac']->id)->sole();
        $this->assertSame($manager->id, $adapter->verified_by);
        $this->assertNotNull($adapter->verified_at);
        $this->assertSame('GB/T → Type 2', $adapter->adapter_name);

        $incompatible = ConnectorCompatibilityRule::query()->where('vehicle_connector_type_id', $c['ccs2']->id)->sole();
        $this->assertSame(Compatibility::Incompatible, $incompatible->compatibility);
        $this->assertNull($incompatible->adapter_name);
        $this->assertSame($manager->id, $incompatible->verified_by);
        $this->assertSame(2, AuditLog::query()->where('action', 'vehicles.master_changed')->where('entity_type', $adapter->getMorphClass())->count());

        $this->put('/admin/vehicles/compatibility', ['rules' => [['vehicle_connector_type_id' => 999999, 'station_connector_type_id' => $c['ccs2']->id, 'compatibility' => 'direct']]])
            ->assertSessionHasErrors('rules.0.vehicle_connector_type_id');
        $this->put('/admin/vehicles/compatibility', ['rules' => [['vehicle_connector_type_id' => $c['ccs2']->id, 'station_connector_type_id' => $c['ccs2']->id, 'compatibility' => 'maybe']]])
            ->assertSessionHasErrors('rules.0.compatibility');
    }

    public function test_connector_types_and_batteries_crud(): void
    {
        $this->actingAsStaff(['vehicles.manage_master']);

        $this->post('/admin/vehicles/connectors', ['code' => ' CHAOJI ', 'name_ar' => 'تشاوجي', 'name_en' => 'ChaoJi', 'current_type' => 'dc'])->assertSessionHasNoErrors();
        $connector = ConnectorType::query()->where('code', 'chaoji')->sole();
        $this->post('/admin/vehicles/connectors', ['code' => 'chaoji', 'name_ar' => 'x', 'name_en' => 'x', 'current_type' => 'dc'])->assertSessionHasErrors('code');
        $this->post("/admin/vehicles/connectors/{$connector->id}/toggle")->assertRedirect();
        $this->assertFalse($connector->fresh()->is_active);

        $this->post('/admin/vehicles/batteries', ['name' => '75 kWh NMC', 'capacity_kwh' => '75.5', 'chemistry' => 'NMC'])->assertSessionHasNoErrors();
        $battery = BatteryVariant::query()->sole();
        $this->put("/admin/vehicles/batteries/{$battery->id}", ['name' => '75 kWh NMC', 'capacity_kwh' => '76', 'chemistry' => 'plutonium'])->assertSessionHasErrors('chemistry');
        $this->delete("/admin/vehicles/batteries/{$battery->id}")->assertRedirect();
        $this->assertModelMissing($battery);
    }

    public function test_master_data_changes_flush_the_public_catalog_cache(): void
    {
        $this->actingAsStaff(['vehicles.manage_master']);
        $make = VehicleMake::factory()->create(['name_en' => 'Before']);
        VehicleModel::factory()->create(['vehicle_make_id' => $make->id]);

        $this->getJson('/en/vehicles/data')->assertJsonPath('makes.0.name', 'Before');

        $this->put("/admin/vehicles/makes/{$make->id}", ['name_ar' => 'بعد', 'name_en' => 'After'])->assertSessionHasNoErrors();
        $this->getJson('/en/vehicles/data')->assertJsonPath('makes.0.name', 'After');

        $this->post("/admin/vehicles/makes/{$make->id}/toggle");
        $this->getJson('/en/vehicles/data')->assertJsonCount(0, 'makes');
    }
}
