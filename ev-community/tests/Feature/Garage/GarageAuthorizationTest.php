<?php

namespace Tests\Feature\Garage;

use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use App\Modules\Vehicles\Models\MemberVehicle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;
use Tests\Feature\Vehicles\VehicleFixtures;
use Tests\TestCase;

/** IDOR: a member can never read or change another member's vehicle through its public_id. */
class GarageAuthorizationTest extends TestCase
{
    use RefreshDatabase;
    use VehicleFixtures;

    private MemberVehicle $victimVehicle;

    protected function setUp(): void
    {
        parent::setUp();
        $victim = $this->makeMember();
        $this->victimVehicle = $this->vehicleFor($victim, ['vin' => $this->vin(7), 'is_primary' => true, 'odometer_km' => 1000]);
    }

    public function test_guests_are_redirected_to_login(): void
    {
        $id = $this->victimVehicle->public_id;
        $this->get('/account/garage')->assertRedirect();
        $this->get("/account/garage/{$id}")->assertRedirect();
        $this->postJson("/account/garage/{$id}/vin/reveal")->assertUnauthorized();
    }

    public function test_another_member_cannot_view_edit_or_delete_the_vehicle(): void
    {
        $this->actingAsMember();
        $id = $this->victimVehicle->public_id;
        $payload = [
            'vehicle_make_id' => $this->victimVehicle->vehicle_make_id,
            'vehicle_model_id' => $this->victimVehicle->vehicle_model_id,
            'year' => 2020,
            'market_version' => 'europe',
            'nickname' => 'Hijacked',
        ];

        $this->get("/account/garage/{$id}")->assertForbidden();
        $this->get("/account/garage/{$id}?tab=odometer", $this->partialReload('member/garage/show', ['section_odometer']))->assertForbidden();
        $this->get("/account/garage/{$id}/edit")->assertForbidden();
        $this->put("/account/garage/{$id}", $payload)->assertForbidden();
        $this->delete("/account/garage/{$id}")->assertForbidden();
        $this->post("/account/garage/{$id}/status", ['status' => 'sold'])->assertForbidden();
        $this->post("/account/garage/{$id}/primary")->assertForbidden();
        $this->post("/account/garage/{$id}/odometer", ['odometer_km' => 999999])->assertForbidden();
        $this->postJson("/account/garage/{$id}/vin/reveal")->assertForbidden();

        $fresh = $this->victimVehicle->fresh();
        $this->assertNull($fresh->nickname);
        $this->assertSame(VehicleStatus::Active, $fresh->status);
        $this->assertSame(1000, $fresh->odometer_km);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'vehicles.vin_revealed']);
    }

    public function test_staff_with_vehicles_view_who_is_also_a_member_cannot_use_the_member_garage_on_others(): void
    {
        $user = $this->actingAsMember();
        $user->givePermissionTo(Permission::findOrCreate('vehicles.view', 'web'));
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $this->get("/account/garage/{$this->victimVehicle->public_id}")->assertForbidden();
        $this->postJson("/account/garage/{$this->victimVehicle->public_id}/vin/reveal")->assertForbidden();
    }

    public function test_unknown_or_numeric_ids_are_not_found(): void
    {
        $this->actingAsMember();
        $this->get('/account/garage/'.$this->victimVehicle->id)->assertNotFound();
        $this->get('/account/garage/01HZZZZZZZZZZZZZZZZZZZZZZZ')->assertNotFound();
    }

    public function test_staff_without_membership_cannot_reach_the_member_garage(): void
    {
        $this->actingAsStaff(['vehicles.view']);
        $this->get('/account/garage')->assertRedirect();
        $this->get("/account/garage/{$this->victimVehicle->public_id}")->assertRedirect();
    }

    public function test_pending_membership_cannot_add_vehicles(): void
    {
        $this->actingAsMember([], ['status' => 'pending', 'approved_at' => null]);
        $this->get('/account/garage/create')->assertRedirect(route('member.status'));
        $this->post('/account/garage', [])->assertRedirect(route('member.status'));
    }

    public function test_member_cannot_attach_a_vehicle_to_someone_else_by_posting_a_user_id(): void
    {
        $member = $this->actingAsMember();
        $victim = $this->victimVehicle->user;

        $this->post('/account/garage', [
            'user_id' => $victim->id,
            'membership_id' => $this->victimVehicle->membership_id,
            'vehicle_make_id' => $this->victimVehicle->vehicle_make_id,
            'vehicle_model_id' => $this->victimVehicle->vehicle_model_id,
            'year' => 2022,
            'market_version' => 'europe',
        ])->assertRedirect();

        $this->assertSame(1, MemberVehicle::query()->where('user_id', $member->id)->count());
        $this->assertSame(1, MemberVehicle::query()->where('user_id', $victim->id)->count());
    }
}
