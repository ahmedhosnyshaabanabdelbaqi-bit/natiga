<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Modules\Members\Models\Membership;
use App\Modules\System\Services\Settings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Fortify\Features;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessFortifyHas(Features::registration());
        $this->syncRbac();
    }

    public function test_registration_screen_can_be_rendered(): void
    {
        $this->get(route('register'))->assertOk();
    }

    public function test_new_users_register_as_pending_members_by_default(): void
    {
        $response = $this->post(route('register.store'), [
            'name' => 'Test User',
            'email' => 'test@example.com',
            'mobile' => '01012345678',
            'password' => 'password',
            'password_confirmation' => 'password',
            'terms' => '1',
        ]);

        $this->assertAuthenticated();
        $response->assertRedirect('/account');

        $user = User::query()->where('email', 'test@example.com')->firstOrFail();
        $this->assertTrue($user->hasRole('member'));
        $this->assertFalse($user->isStaff());
        $membership = Membership::query()->where('user_id', $user->id)->firstOrFail();
        $this->assertSame('pending', $membership->status->value);
        $this->assertMatchesRegularExpression('/^EV-\d{6}$/', $membership->member_number);
        $this->assertDatabaseHas('consent_logs', ['user_id' => $user->id, 'consent_type' => 'terms']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'members.registered', 'entity_id' => $membership->id]);

        // Pending members are routed to the status page instead of the dashboard.
        $this->get('/account')->assertRedirect(route('member.status'));
    }

    public function test_open_registration_creates_active_members(): void
    {
        Settings::set('members.registration_mode', 'open');

        $this->post(route('register.store'), [
            'name' => 'Open User', 'email' => 'open@example.com', 'mobile' => '01112345678',
            'password' => 'password', 'password_confirmation' => 'password', 'terms' => '1',
        ]);

        $membership = Membership::query()->whereRelation('user', 'email', 'open@example.com')->firstOrFail();
        $this->assertSame('active', $membership->status->value);
        $this->get('/account')->assertOk();
    }

    public function test_invitation_only_registration_requires_a_valid_code(): void
    {
        Settings::set('members.registration_mode', 'invitation_only');
        $referrer = $this->makeMember();

        $this->post(route('register.store'), [
            'name' => 'Invited', 'email' => 'invited@example.com', 'mobile' => '01212345678',
            'password' => 'password', 'password_confirmation' => 'password', 'terms' => '1', 'invitation_code' => 'NOPE',
        ])->assertSessionHasErrors('invitation_code');

        $this->post(route('register.store'), [
            'name' => 'Invited', 'email' => 'invited@example.com', 'mobile' => '01212345678',
            'password' => 'password', 'password_confirmation' => 'password', 'terms' => '1', 'invitation_code' => $referrer->membership->referral_code,
        ]);

        $membership = Membership::query()->whereRelation('user', 'email', 'invited@example.com')->firstOrFail();
        $this->assertSame($referrer->membership->id, $membership->referred_by);
    }

    public function test_registration_validates_terms_and_egyptian_mobile(): void
    {
        $this->post(route('register.store'), [
            'name' => 'X', 'email' => 'bad', 'mobile' => '12345', 'password' => 'password', 'password_confirmation' => 'password',
        ])->assertSessionHasErrors(['name', 'email', 'mobile', 'terms']);
        $this->assertGuest();
    }
}
