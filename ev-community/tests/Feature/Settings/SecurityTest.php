<?php

namespace Tests\Feature\Settings;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Audit\Models\SecurityEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Fortify\Features;
use Tests\TestCase;

class SecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_security_page_is_displayed()
    {
        $this->skipUnlessFortifyHas(Features::twoFactorAuthentication());

        Features::twoFactorAuthentication([
            'confirm' => true,
            'confirmPassword' => true,
        ]);
        Features::passkeys([
            'confirmPassword' => true,
        ]);

        $user = User::factory()->create();

        $this->actingAs($user)
            ->withSession(['auth.password_confirmed_at' => time()])
            ->get(route('security.edit'))
            ->assertInertia(fn (Assert $page) => $page
                ->component('settings/security')
                ->where('canManagePasskeys', true)
                ->where('passkeys', [])
                ->where('canManageTwoFactor', true)
                ->where('twoFactorEnabled', false),
            );
    }

    public function test_security_page_requires_password_confirmation_when_enabled()
    {
        $this->skipUnlessFortifyHas(Features::twoFactorAuthentication());

        $user = User::factory()->create();

        Features::twoFactorAuthentication([
            'confirm' => true,
            'confirmPassword' => true,
        ]);

        $response = $this->actingAs($user)
            ->get(route('security.edit'));

        $response->assertRedirect(route('password.confirm'));
    }

    public function test_security_page_renders_without_two_factor_when_feature_is_disabled()
    {
        $this->skipUnlessFortifyHas(Features::twoFactorAuthentication());

        config(['fortify.features' => []]);

        $user = User::factory()->create();

        $this->actingAs($user)
            ->withSession(['auth.password_confirmed_at' => time()])
            ->get(route('security.edit'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('settings/security')
                ->where('canManagePasskeys', false)
                ->where('passkeys', [])
                ->where('canManageTwoFactor', false)
                ->missing('twoFactorEnabled')
                ->missing('requiresConfirmation'),
            );
    }

    public function test_password_can_be_updated()
    {
        $user = User::factory()->create();

        $response = $this
            ->actingAs($user)
            ->from(route('security.edit'))
            ->put(route('user-password.update'), [
                'current_password' => 'password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ]);

        $response
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('security.edit'));

        $this->assertTrue(Hash::check('new-password', $user->refresh()->password));
    }

    public function test_correct_password_must_be_provided_to_update_password()
    {
        $user = User::factory()->create();

        $response = $this
            ->actingAs($user)
            ->from(route('security.edit'))
            ->put(route('user-password.update'), [
                'current_password' => 'wrong-password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ]);

        $response
            ->assertSessionHasErrors('current_password')
            ->assertRedirect(route('security.edit'));
    }

    public function test_password_change_is_audited_recorded_and_stamps_password_changed_at(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->from(route('security.edit'))
            ->put(route('user-password.update'), [
                'current_password' => 'password',
                'password' => 'a-Much-Longer-Passphrase-2026',
                'password_confirmation' => 'a-Much-Longer-Passphrase-2026',
            ])
            ->assertSessionHasNoErrors()
            ->assertInertiaFlash('toast', ['type' => 'success', 'message' => __('settings.security.password_updated')]);

        $user->refresh();
        $this->assertNotNull($user->password_changed_at);
        $this->assertTrue(Hash::check('a-Much-Longer-Passphrase-2026', $user->password));

        $audit = AuditLog::query()->where('action', 'auth.password_changed')->where('entity_id', $user->id)->sole();
        $this->assertSame($user->id, $audit->actor_id);
        $this->assertStringNotContainsString('Passphrase', json_encode([$audit->old_values, $audit->new_values]));
        $this->assertTrue(SecurityEvent::query()->where('user_id', $user->id)->where('event_type', 'password_changed')->exists());
    }

    public function test_password_change_signs_out_the_users_other_devices_only(): void
    {
        config(['session.driver' => 'database']);
        $user = User::factory()->create();
        $other = User::factory()->create();
        foreach ([[$user->id, 'phone'], [$user->id, 'laptop'], [$other->id, 'other']] as [$owner, $agent]) {
            DB::table('sessions')->insert(['id' => Str::random(40), 'user_id' => $owner, 'ip_address' => '10.0.0.1', 'user_agent' => $agent, 'payload' => base64_encode('x'), 'last_activity' => now()->getTimestamp()]);
        }

        $this->actingAs($user)
            ->from(route('security.edit'))
            ->put(route('user-password.update'), [
                'current_password' => 'password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])
            ->assertSessionHasNoErrors()
            ->assertInertiaFlash('toast', ['type' => 'success', 'message' => trans_choice('settings.security.password_updated_sessions', 2, ['count' => 2])]);

        $this->assertSame(0, DB::table('sessions')->where('user_id', $user->id)->whereIn('user_agent', ['phone', 'laptop'])->count());
        $this->assertSame(1, DB::table('sessions')->where('user_id', $other->id)->count());
        $this->assertAuthenticatedAs($user);

        $audit = AuditLog::query()->where('action', 'auth.password_changed')->sole();
        $this->assertSame(['other_sessions_revoked' => 2], $audit->new_values);
    }

    public function test_failed_password_change_leaves_no_trace(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->from(route('security.edit'))
            ->put(route('user-password.update'), [
                'current_password' => 'password',
                'password' => 'new-password',
                'password_confirmation' => 'does-not-match',
            ])
            ->assertSessionHasErrors('password');

        $this->assertTrue(Hash::check('password', $user->refresh()->password));
        $this->assertNull($user->password_changed_at);
        $this->assertFalse(AuditLog::query()->where('action', 'auth.password_changed')->exists());
        $this->assertFalse(SecurityEvent::query()->where('event_type', 'password_changed')->exists());
    }

    public function test_password_update_is_rate_limited(): void
    {
        $user = User::factory()->create();

        for ($attempt = 0; $attempt < 6; $attempt++) {
            $this->actingAs($user)
                ->from(route('security.edit'))
                ->put(route('user-password.update'), ['current_password' => 'wrong', 'password' => 'new-password', 'password_confirmation' => 'new-password'])
                ->assertSessionHasErrors('current_password');
        }

        $this->actingAs($user)
            ->put(route('user-password.update'), ['current_password' => 'password', 'password' => 'new-password', 'password_confirmation' => 'new-password'])
            ->assertTooManyRequests();

        $this->assertTrue(Hash::check('password', $user->refresh()->password));
    }

    public function test_guests_cannot_reach_security_settings(): void
    {
        $this->get(route('security.edit'))->assertRedirect(route('login'));
        $this->put(route('user-password.update'), ['current_password' => 'password', 'password' => 'x', 'password_confirmation' => 'x'])->assertRedirect(route('login'));
    }

    public function test_unverified_users_must_verify_their_email_first(): void
    {
        $user = User::factory()->unverified()->create();

        $this->actingAs($user)->get(route('security.edit'))->assertRedirect(route('verification.notice'));
        $this->actingAs($user)->get(route('appearance.edit'))->assertRedirect(route('verification.notice'));
    }

    public function test_appearance_page_is_displayed(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get(route('appearance.edit'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('settings/appearance'));
    }

    public function test_settings_root_redirects_to_profile(): void
    {
        $this->actingAs(User::factory()->create())->get('/settings')->assertRedirect('/settings/profile');
    }
}
