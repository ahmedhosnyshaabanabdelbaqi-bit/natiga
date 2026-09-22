<?php

namespace Tests\Feature\Members;

use App\Modules\Members\Actions\ChangeMembershipStatus;
use App\Modules\Members\Events\MembershipApproved;
use App\Modules\Members\Events\MembershipReactivated;
use App\Modules\Members\Events\MembershipSuspended;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Membership;
use App\Modules\Members\Models\MembershipStatusHistory;
use App\Modules\Notifications\Models\Notification;
use App\Modules\System\Services\Settings;
use App\Support\Exceptions\DomainException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class MembershipStatusTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Settings::flush(); // the settings service memoises values in a static between tests
    }

    public function test_approve_requires_members_approve_and_writes_history_audit_and_notification(): void
    {
        $member = $this->makeMember([], ['status' => MembershipStatus::Pending, 'approved_at' => null]);
        $membership = $member->membership;

        $this->actingAsStaff(['members.view', 'members.edit']);
        $this->post(route('admin.members.approve', $membership))->assertForbidden();

        $staff = $this->actingAsStaff(['members.view', 'members.approve']);
        $this->post(route('admin.members.approve', $membership))->assertRedirect()->assertSessionHasNoErrors();

        $membership->refresh();
        $this->assertSame(MembershipStatus::Active, $membership->status);
        $this->assertNotNull($membership->approved_at);
        $this->assertSame($staff->id, $membership->approved_by);
        $this->assertNotNull($membership->expires_at);
        $this->assertDatabaseHas('membership_status_history', ['membership_id' => $membership->id, 'from_status' => 'pending', 'to_status' => 'active', 'changed_by' => $staff->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'members.status_changed', 'entity_id' => $membership->id, 'actor_id' => $staff->id]);

        $notification = Notification::query()->where('user_id', $member->id)->where('key', 'members.membership_approved')->first();
        $this->assertNotNull($notification, 'the member is notified through the Notifications module');
        $this->assertSame('/account/membership-card', $notification->url);
        $this->assertStringContainsString($membership->member_number, $notification->body);
    }

    public function test_approving_twice_is_idempotent(): void
    {
        $member = $this->makeMember([], ['status' => MembershipStatus::Pending]);
        $this->actingAsStaff(['members.view', 'members.approve']);

        $this->post(route('admin.members.approve', $member->membership))->assertRedirect();
        $this->post(route('admin.members.approve', $member->membership))->assertRedirect()->assertSessionHasNoErrors();

        $this->assertSame(1, MembershipStatusHistory::query()->where('membership_id', $member->membership->id)->where('to_status', 'active')->count());
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'members.status_changed')->where('entity_id', $member->membership->id)->count());
        $this->assertSame(1, Notification::query()->where('user_id', $member->id)->where('key', 'members.membership_approved')->count());
    }

    public function test_sequential_transactions_on_the_same_membership_apply_once(): void
    {
        $member = $this->makeMember([], ['status' => MembershipStatus::Pending]);
        $action = app(ChangeMembershipStatus::class);
        $staff = $this->makeStaff(['members.approve']);
        // Two requests holding the same stale model (read before either committed).
        $staleA = Membership::query()->findOrFail($member->membership->id);
        $staleB = Membership::query()->findOrFail($member->membership->id);

        $action->execute($staleA, MembershipStatus::Active, $staff);
        $action->execute($staleB, MembershipStatus::Active, $staff);

        $this->assertSame(1, MembershipStatusHistory::query()->where('membership_id', $member->membership->id)->count());
    }

    public function test_reject_and_suspend_require_a_reason(): void
    {
        $pending = $this->makeMember([], ['status' => MembershipStatus::Pending]);
        $active = $this->makeMember();
        $this->actingAsStaff(['members.view', 'members.approve', 'members.suspend']);

        $this->post(route('admin.members.reject', $pending->membership))->assertSessionHasErrors('reason');
        $this->post(route('admin.members.reject', $pending->membership), ['reason' => 'no'])->assertSessionHasErrors('reason');
        $this->post(route('admin.members.suspend', $active->membership), ['reason' => ''])->assertSessionHasErrors('reason');
        $this->assertSame(MembershipStatus::Pending, $pending->membership->fresh()->status);
        $this->assertSame(MembershipStatus::Active, $active->membership->fresh()->status);

        $this->post(route('admin.members.reject', $pending->membership), ['reason' => 'Duplicate registration'])->assertSessionHasNoErrors();
        $this->assertSame(MembershipStatus::Rejected, $pending->membership->fresh()->status);
        $this->assertDatabaseHas('membership_status_history', ['membership_id' => $pending->membership->id, 'to_status' => 'rejected', 'reason' => 'Duplicate registration']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'members.status_changed', 'entity_id' => $pending->membership->id, 'reason' => 'Duplicate registration']);
    }

    public function test_the_action_itself_refuses_suspension_without_reason(): void
    {
        $member = $this->makeMember();

        $this->expectException(DomainException::class);
        app(ChangeMembershipStatus::class)->execute($member->membership, MembershipStatus::Suspended, null, '   ');
    }

    public function test_suspend_ends_every_session_revokes_tokens_and_records_a_security_event(): void
    {
        config(['session.driver' => 'database']);
        $member = $this->makeMember();
        $member->forceFill(['remember_token' => 'remember-me-token'])->save();
        $member->createToken('mobile-app');
        foreach (['s1', 's2'] as $id) {
            DB::table('sessions')->insert(['id' => $id, 'user_id' => $member->id, 'ip_address' => '10.0.0.1', 'user_agent' => 'test', 'payload' => 'x', 'last_activity' => time()]);
        }
        DB::table('sessions')->insert(['id' => 'other', 'user_id' => null, 'ip_address' => '10.0.0.2', 'user_agent' => 'test', 'payload' => 'x', 'last_activity' => time()]);
        Event::fake([MembershipSuspended::class]);

        $staff = $this->actingAsStaff(['members.view', 'members.suspend']);
        $this->post(route('admin.members.suspend', $member->membership), ['reason' => 'Fraudulent payment proofs'])->assertSessionHasNoErrors();

        $this->assertSame(MembershipStatus::Suspended, $member->membership->fresh()->status);
        $this->assertNotNull($member->membership->fresh()->suspended_at);
        $this->assertSame(0, DB::table('sessions')->where('user_id', $member->id)->count());
        $this->assertSame(1, DB::table('sessions')->where('id', 'other')->count());
        $this->assertSame(0, $member->tokens()->count());
        $this->assertNull($member->fresh()->remember_token);
        $this->assertDatabaseHas('user_security_events', ['user_id' => $member->id, 'event_type' => 'membership_suspended', 'severity' => 'warning']);
        $this->assertDatabaseHas('membership_status_history', ['membership_id' => $member->membership->id, 'to_status' => 'suspended', 'changed_by' => $staff->id, 'reason' => 'Fraudulent payment proofs']);
        Event::assertDispatched(MembershipSuspended::class, fn (MembershipSuspended $event) => $event->membership->is($member->membership) && $event->reason === 'Fraudulent payment proofs');
    }

    public function test_suspended_member_is_locked_out_of_the_portal(): void
    {
        $member = $this->actingAsMember();
        app(ChangeMembershipStatus::class)->execute($member->membership, MembershipStatus::Suspended, null, 'Policy violation');
        $member->unsetRelation('membership'); // a real request reloads the user; the test keeps the same instance

        $this->get(route('member.membership-card'))->assertRedirect(route('member.status'));
        $this->get(route('member.status'))->assertOk()->assertInertia(fn ($page) => $page->component('member/status'));
    }

    public function test_invalid_transitions_are_rejected_with_422(): void
    {
        $pending = $this->makeMember([], ['status' => MembershipStatus::Pending]);
        $rejected = $this->makeMember([], ['status' => MembershipStatus::Rejected]);
        $this->actingAsStaff(['members.view', 'members.approve', 'members.suspend', 'members.edit']);

        // pending → suspended / expired are not allowed.
        $this->postJson(route('admin.members.suspend', $pending->membership), ['reason' => 'Some valid reason'])->assertStatus(422)->assertJsonPath('errors.status.0', fn ($message) => is_string($message) && $message !== '');
        $this->postJson(route('admin.members.expire', $pending->membership))->assertStatus(422);
        // rejected → active is not allowed (it must be re-opened first).
        $this->postJson(route('admin.members.approve', $rejected->membership))->assertStatus(422);
        // Web requests get a validation error on `status` instead.
        $this->post(route('admin.members.reactivate', $rejected->membership))->assertSessionHasErrors('status');

        $this->assertSame(MembershipStatus::Pending, $pending->membership->fresh()->status);
        $this->assertSame(MembershipStatus::Rejected, $rejected->membership->fresh()->status);
        $this->assertSame(0, MembershipStatusHistory::query()->count());
    }

    public function test_full_lifecycle_follows_the_state_machine(): void
    {
        $member = $this->makeMember([], ['status' => MembershipStatus::Pending]);
        $membership = $member->membership;
        $this->actingAsStaff(['members.view', 'members.approve', 'members.suspend', 'members.edit']);
        Event::fake([MembershipApproved::class, MembershipReactivated::class]);

        $this->post(route('admin.members.reject', $membership), ['reason' => 'Missing documents'])->assertSessionHasNoErrors();
        $this->post(route('admin.members.reopen', $membership))->assertSessionHasNoErrors();
        $this->post(route('admin.members.approve', $membership))->assertSessionHasNoErrors();
        $this->post(route('admin.members.suspend', $membership), ['reason' => 'Chargeback dispute'])->assertSessionHasNoErrors();
        $this->post(route('admin.members.reactivate', $membership))->assertSessionHasNoErrors();
        $this->post(route('admin.members.expire', $membership))->assertSessionHasNoErrors();
        $this->post(route('admin.members.reactivate', $membership))->assertSessionHasNoErrors();

        $this->assertSame(MembershipStatus::Active, $membership->fresh()->status);
        $this->assertSame(
            ['pending>rejected', 'rejected>pending', 'pending>active', 'active>suspended', 'suspended>active', 'active>expired', 'expired>active'],
            MembershipStatusHistory::query()->where('membership_id', $membership->id)->orderBy('id')->get()->map(fn ($h) => $h->from_status.'>'.$h->to_status)->all(),
        );
        Event::assertDispatchedTimes(MembershipApproved::class, 1);
        Event::assertDispatchedTimes(MembershipReactivated::class, 2);
    }

    public function test_bulk_approve_approves_pending_only_and_skips_the_rest(): void
    {
        $a = $this->makeMember([], ['status' => MembershipStatus::Pending]);
        $b = $this->makeMember([], ['status' => MembershipStatus::Pending]);
        $active = $this->makeMember();
        $this->actingAsStaff(['members.view', 'members.approve']);

        $this->post(route('admin.members.bulk-approve'), ['ids' => [$a->membership->public_id, $b->membership->public_id, $active->membership->public_id]])
            ->assertRedirect()->assertSessionHas('success');

        $this->assertSame(MembershipStatus::Active, $a->membership->fresh()->status);
        $this->assertSame(MembershipStatus::Active, $b->membership->fresh()->status);
        $this->assertSame(0, MembershipStatusHistory::query()->where('membership_id', $active->membership->id)->count());

        $this->post(route('admin.members.bulk-approve'), ['ids' => ['not-a-ulid']])->assertSessionHasErrors('ids.0');
        $this->post(route('admin.members.bulk-approve'), ['ids' => []])->assertSessionHasErrors('ids');
    }

    public function test_expire_command_only_runs_when_enabled_and_expires_past_due_memberships(): void
    {
        $due = $this->makeMember([], ['expires_at' => now()->subDay()]);
        $current = $this->makeMember([], ['expires_at' => now()->addMonth()]);

        $this->artisan('members:expire')->assertSuccessful();
        $this->assertSame(MembershipStatus::Active, $due->membership->fresh()->status);

        $this->artisan('members:expire', ['--force' => true])->assertSuccessful();
        $this->assertSame(MembershipStatus::Expired, $due->membership->fresh()->status);
        $this->assertSame(MembershipStatus::Active, $current->membership->fresh()->status);
        $this->assertDatabaseHas('membership_status_history', ['membership_id' => $due->membership->id, 'to_status' => 'expired', 'changed_by' => null]);
    }
}
