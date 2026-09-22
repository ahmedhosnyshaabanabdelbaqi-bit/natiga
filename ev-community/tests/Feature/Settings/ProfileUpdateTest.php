<?php

namespace Tests\Feature\Settings;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Audit\Models\SecurityEvent;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ProfileUpdateTest extends TestCase
{
    use RefreshDatabase;

    public function test_profile_page_is_displayed(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get(route('profile.edit'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('settings/profile')
                ->where('mustVerifyEmail', true)
                ->where('auth.user.email', $user->email));
    }

    public function test_guests_are_redirected_to_login(): void
    {
        $this->get(route('profile.edit'))->assertRedirect(route('login'));
        $this->patch(route('profile.update'), ['name' => 'X', 'email' => 'x@example.com'])->assertRedirect(route('login'));
        $this->delete(route('profile.destroy'), ['password' => 'password'])->assertRedirect(route('login'));
    }

    public function test_name_change_is_saved_audited_and_flashed_in_the_current_locale(): void
    {
        app()->setLocale('en');
        $user = User::factory()->create(['name' => 'Old Name']);

        $this->actingAs($user)
            ->patch(route('profile.update'), ['name' => 'New Name', 'email' => $user->email])
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('profile.edit'))
            ->assertInertiaFlash('toast', ['type' => 'success', 'message' => __('settings.profile.updated')]);

        $user->refresh();
        $this->assertSame('New Name', $user->name);
        $this->assertNotNull($user->email_verified_at);

        $audit = AuditLog::query()->where('action', 'auth.profile_updated')->where('entity_id', $user->id)->sole();
        $this->assertSame($user->id, $audit->actor_id);
        $this->assertSame(['name' => 'Old Name'], $audit->old_values);
        $this->assertSame(['name' => 'New Name'], $audit->new_values);
        $this->assertFalse(SecurityEvent::query()->where('user_id', $user->id)->where('event_type', 'email_changed')->exists());
    }

    public function test_unchanged_profile_writes_no_audit_row(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->patch(route('profile.update'), ['name' => $user->name, 'email' => $user->email])
            ->assertSessionHasNoErrors();

        $this->assertSame(0, AuditLog::query()->where('action', 'auth.profile_updated')->count());
        $this->assertNotNull($user->refresh()->email_verified_at);
    }

    public function test_email_change_is_normalised_resets_verification_and_sends_a_new_link(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'old@example.com']);

        $this->actingAs($user)
            ->patch(route('profile.update'), ['name' => $user->name, 'email' => '  New.Address@Example.COM '])
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('profile.edit'))
            ->assertInertiaFlash('toast', ['type' => 'success', 'message' => __('settings.profile.updated_verify_email')]);

        $user->refresh();
        $this->assertSame('new.address@example.com', $user->email);
        $this->assertNull($user->email_verified_at);
        Notification::assertSentTo($user, VerifyEmail::class);

        $this->assertTrue(SecurityEvent::query()->where('user_id', $user->id)->where('event_type', 'email_changed')->exists());
        $audit = AuditLog::query()->where('action', 'auth.profile_updated')->sole();
        $this->assertSame(['email' => 'old@example.com'], $audit->old_values);
        $this->assertSame(['email' => 'new.address@example.com'], $audit->new_values);
    }

    public function test_the_user_can_still_log_in_after_changing_email_with_capitals(): void
    {
        $user = $this->makeMember();

        $this->actingAs($user)->patch(route('profile.update'), ['name' => $user->name, 'email' => 'Mixed.Case@Example.com']);
        $this->post(route('logout'));

        $this->post(route('login.store'), ['email' => 'mixed.case@example.com', 'password' => 'password'])->assertSessionHasNoErrors();
        $this->assertAuthenticatedAs($user);
    }

    public function test_email_must_be_unique_regardless_of_case(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);
        $user = User::factory()->create();

        $this->actingAs($user)
            ->from(route('profile.edit'))
            ->patch(route('profile.update'), ['name' => $user->name, 'email' => 'TAKEN@example.com'])
            ->assertSessionHasErrors('email')
            ->assertRedirect(route('profile.edit'));

        $this->assertNotSame('taken@example.com', $user->refresh()->email);
    }

    public function test_profile_update_validates_input(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->from(route('profile.edit'))
            ->patch(route('profile.update'), ['name' => '', 'email' => 'not-an-email'])
            ->assertSessionHasErrors(['name', 'email']);

        $this->actingAs($user)
            ->patch(route('profile.update'), ['name' => str_repeat('a', 256), 'email' => $user->email])
            ->assertSessionHasErrors('name');
    }

    public function test_validation_messages_use_translated_attribute_names(): void
    {
        app()->setLocale('ar');
        $user = User::factory()->create();

        $response = $this->actingAs($user)
            ->from(route('profile.edit'))
            ->patch(route('profile.update'), ['name' => '', 'email' => $user->email]);

        $response->assertSessionHasErrors('name');
        $this->assertStringContainsString(__('settings.profile.name'), session('errors')->first('name'));
    }

    public function test_a_user_can_only_update_their_own_profile(): void
    {
        $victim = User::factory()->create(['name' => 'Victim', 'email' => 'victim@example.com']);
        $attacker = User::factory()->create();

        // The endpoint has no id parameter: extra fields are ignored and only the actor changes.
        $this->actingAs($attacker)
            ->patch(route('profile.update'), ['name' => 'Hacked', 'email' => $attacker->email, 'id' => $victim->id, 'public_id' => $victim->public_id])
            ->assertSessionHasNoErrors();

        $this->assertSame('Victim', $victim->refresh()->name);
        $this->assertSame('Hacked', $attacker->refresh()->name);
    }

    public function test_mass_assignment_of_privileged_columns_is_ignored(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->patch(route('profile.update'), ['name' => $user->name, 'email' => $user->email, 'status' => 'disabled', 'email_verified_at' => null, 'preferred_locale' => 'en'])
            ->assertSessionHasNoErrors();

        $user->refresh();
        $this->assertSame(User::STATUS_ACTIVE, $user->status);
        $this->assertNotNull($user->email_verified_at);
    }

    public function test_members_cannot_hard_delete_their_account_and_are_sent_to_privacy(): void
    {
        $member = $this->actingAsMember();

        $this->delete(route('profile.destroy'), ['password' => 'password'])
            ->assertRedirect(route('member.privacy.index'))
            ->assertSessionHas('warning', __('settings.delete_account.not_allowed'));

        $this->assertNotNull($member->fresh());
        $this->assertNotNull($member->membership()->first());
        $this->assertAuthenticatedAs($member);
        $this->assertTrue(SecurityEvent::query()->where('user_id', $member->id)->where('event_type', 'account_self_delete_refused')->exists());
    }

    public function test_staff_cannot_delete_their_own_account(): void
    {
        $staff = $this->actingAsStaff();

        $this->delete(route('profile.destroy'), ['password' => 'password'])->assertForbidden();

        $this->assertNotNull($staff->fresh());
    }

    public function test_correct_password_is_still_required(): void
    {
        $member = $this->actingAsMember();

        $this->from(route('profile.edit'))
            ->delete(route('profile.destroy'), ['password' => 'wrong-password'])
            ->assertSessionHasErrors('password')
            ->assertRedirect(route('profile.edit'));

        $this->assertNotNull($member->fresh());
        $this->assertFalse(SecurityEvent::query()->where('event_type', 'account_self_delete_refused')->exists());
    }
}
