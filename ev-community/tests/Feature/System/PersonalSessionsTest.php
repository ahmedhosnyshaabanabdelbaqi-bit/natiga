<?php

namespace Tests\Feature\System;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Audit\Models\SecurityEvent;
use App\Modules\System\Services\SessionKeys;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Feature\System\Concerns\InteractsWithSessions;
use Tests\TestCase;

/**
 * /settings/sessions: every user manages only their own sessions; raw session ids never reach the browser.
 */
class PersonalSessionsTest extends TestCase
{
    use InteractsWithSessions;
    use RefreshDatabase;

    private function withCurrentSession(User $user): string
    {
        $current = Str::random(40);
        $this->makeSession($user, 'Current browser', $current);
        $this->withCookie(config('session.cookie'), $current);

        return $current;
    }

    public function test_guests_are_redirected(): void
    {
        $this->get('/settings/sessions')->assertRedirect();
    }

    public function test_page_lists_own_sessions_with_opaque_keys_only(): void
    {
        $this->useDatabaseSessions();
        $user = User::factory()->create();
        $this->actingAs($user);
        $current = $this->withCurrentSession($user);
        $other = $this->makeSession($user, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1');
        $stranger = User::factory()->create();
        $this->makeSession($stranger);

        $response = $this->get('/settings/sessions')->assertOk();
        $this->assertStringNotContainsString($current, $response->getContent());
        $this->assertStringNotContainsString($other, $response->getContent());
        $response->assertInertia(fn (Assert $page) => $page->component('settings/sessions')
            ->where('supported', true)
            ->has('sessions', 2)
            ->where('sessions', fn ($sessions) => collect($sessions)->contains(fn ($s) => $s['is_current'] === true && $s['id'] === SessionKeys::keyFor($current))
                && collect($sessions)->contains(fn ($s) => $s['device'] === 'Safari iOS')));
    }

    public function test_logout_others_requires_the_current_password_and_deletes_only_other_sessions(): void
    {
        $this->useDatabaseSessions();
        $user = User::factory()->create(['password' => Hash::make('Correct-Horse-9!')]);
        $this->actingAs($user);
        $current = $this->withCurrentSession($user);
        $this->makeSession($user);
        $this->makeSession($user);
        $stranger = User::factory()->create();
        $this->makeSession($stranger);
        $passwordHash = $user->password;

        $this->post('/settings/sessions/logout-others', ['current_password' => 'wrong-password'])->assertSessionHasErrors('current_password');
        $this->assertSame(3, $this->sessionCount($user));

        $this->post('/settings/sessions/logout-others', ['current_password' => 'Correct-Horse-9!'])->assertRedirect()->assertSessionHasNoErrors();

        $this->assertSame([$current], DB::table('sessions')->where('user_id', $user->id)->pluck('id')->all(), 'only the current session survives');
        $this->assertSame(1, $this->sessionCount($stranger), 'other users are untouched');
        $this->assertNotSame($passwordHash, $user->fresh()->password, 'the password is rehashed so remember-me cookies elsewhere stop working');

        $this->assertTrue(AuditLog::query()->where('action', 'sessions.logged_out_others')->where('actor_id', $user->id)->exists());
        $event = SecurityEvent::query()->where('user_id', $user->id)->where('event_type', 'sessions_revoked')->firstOrFail();
        $this->assertSame(2, $event->meta['count']);
    }

    public function test_a_single_session_can_be_revoked_but_not_the_current_one_nor_someone_elses(): void
    {
        $this->useDatabaseSessions();
        $user = User::factory()->create();
        $this->actingAs($user);
        $current = $this->withCurrentSession($user);
        $other = $this->makeSession($user);
        $stranger = User::factory()->create();
        $strangerSession = $this->makeSession($stranger);

        $this->delete('/settings/sessions/'.SessionKeys::keyFor($current))->assertRedirect()->assertSessionHas('error');
        $this->delete('/settings/sessions/'.SessionKeys::keyFor($strangerSession))->assertRedirect()->assertSessionHas('error');
        $this->assertSame(1, $this->sessionCount($stranger));

        $this->delete('/settings/sessions/'.SessionKeys::keyFor($other))->assertRedirect()->assertSessionHas('success');
        $this->assertSame([$current], DB::table('sessions')->where('user_id', $user->id)->pluck('id')->all());
        $this->assertTrue(AuditLog::query()->where('action', 'sessions.revoked')->exists());

        $this->delete('/settings/sessions/not-a-key')->assertNotFound();
    }

    public function test_listing_is_reported_unsupported_with_a_non_database_driver(): void
    {
        $this->actingAs(User::factory()->create());
        $this->get('/settings/sessions')->assertOk()->assertInertia(fn (Assert $page) => $page->where('supported', false)->where('sessions', []));
    }
}
