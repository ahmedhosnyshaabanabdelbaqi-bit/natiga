<?php

namespace Tests\Feature\Members;

use App\Models\User;
use App\Modules\Members\Models\AccountDeletionRequest;
use App\Modules\Members\Models\Enums\DeletionRequestStatus;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Membership;
use App\Modules\Members\Services\MembershipQr;
use App\Modules\System\Services\Settings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Privilege-escalation guards: one permission can only perform its own transition, staff never act on
 * their own membership or on super accounts, and members.edit cannot take over staff accounts.
 */
class MemberEscalationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Settings::flush();
    }

    private function memberWithRole(string $role, array $userAttributes = [], array $membershipAttributes = []): User
    {
        $this->syncRbac();
        $user = User::factory()->create($userAttributes);
        $user->assignRole($role);
        Membership::factory()->create(['user_id' => $user->id] + $membershipAttributes);

        return $user->load('membership');
    }

    public function test_reactivate_permission_cannot_approve_a_pending_membership(): void
    {
        $member = $this->makeMember([], ['status' => MembershipStatus::Pending]);
        $this->actingAsStaff(['members.view', 'members.suspend']);

        $this->postJson(route('admin.members.reactivate', $member->membership))->assertStatus(422)->assertJsonValidationErrors('status');

        $this->assertSame(MembershipStatus::Pending, $member->membership->fresh()->status);
        $this->assertDatabaseMissing('membership_status_history', ['membership_id' => $member->membership->id, 'to_status' => 'active']);
    }

    public function test_approve_permission_cannot_lift_a_suspension_or_renew_an_expiry(): void
    {
        $suspended = $this->makeMember([], ['status' => MembershipStatus::Suspended]);
        $expired = $this->makeMember([], ['status' => MembershipStatus::Expired]);
        $this->actingAsStaff(['members.view', 'members.approve']);

        $this->postJson(route('admin.members.approve', $suspended->membership))->assertStatus(422);
        $this->postJson(route('admin.members.approve', $expired->membership))->assertStatus(422);

        $this->assertSame(MembershipStatus::Suspended, $suspended->membership->fresh()->status);
        $this->assertSame(MembershipStatus::Expired, $expired->membership->fresh()->status);
    }

    public function test_each_endpoint_only_acts_on_its_own_source_status(): void
    {
        $this->actingAsRole('operations-manager');
        $active = $this->makeMember();
        $rejected = $this->makeMember([], ['status' => MembershipStatus::Rejected]);

        // reject only from pending, reopen only from rejected, expire/suspend only from active.
        $this->postJson(route('admin.members.reject', $active->membership), ['reason' => 'Not eligible anymore'])->assertStatus(422);
        $this->postJson(route('admin.members.expire', $rejected->membership))->assertStatus(422);
        $this->postJson(route('admin.members.reopen', $rejected->membership))->assertRedirect();
        $this->assertSame(MembershipStatus::Pending, $rejected->membership->fresh()->status);

        // Repeating a request whose target is already reached stays an idempotent no-op.
        $this->postJson(route('admin.members.reopen', $rejected->membership))->assertRedirect();
        $this->assertSame(1, DB::table('membership_status_history')->where('membership_id', $rejected->membership->id)->where('to_status', 'pending')->count());
    }

    public function test_staff_cannot_change_their_own_membership_from_the_admin_side(): void
    {
        $staff = $this->actingAsStaff(['members.view', 'members.approve', 'members.suspend', 'members.edit']);
        Membership::factory()->create(['user_id' => $staff->id, 'status' => MembershipStatus::Pending]);
        $own = $staff->load('membership')->membership;

        $this->post(route('admin.members.approve', $own))->assertForbidden();
        $this->patch(route('admin.members.update', $own), ['name' => 'New Name', 'email' => 'self@example.com'])->assertForbidden();
        $this->post(route('admin.members.bulk-approve'), ['ids' => [$own->public_id]])->assertRedirect()
            ->assertSessionHas('success', __('members.flash.bulk_approved', ['approved' => 0, 'skipped' => 1]));

        $this->assertSame(MembershipStatus::Pending, $own->fresh()->status);
        $this->get(route('admin.members.show', $own))->assertOk()
            ->assertInertia(fn ($page) => $page->where('membership.abilities.approve', false)->where('membership.abilities.update', false));
    }

    public function test_members_edit_cannot_take_over_an_owner_account(): void
    {
        $owner = $this->memberWithRole('owner', ['email' => 'owner@example.com']);
        $this->actingAsRole('operations-manager');

        $this->patch(route('admin.members.update', $owner->membership), ['name' => 'Owner Person', 'email' => 'attacker@example.com'])->assertForbidden();
        $this->post(route('admin.members.suspend', $owner->membership), ['reason' => 'Trying to lock the owner out'])->assertForbidden();

        $this->assertSame('owner@example.com', $owner->fresh()->email);
        $this->assertSame(MembershipStatus::Active, $owner->membership->fresh()->status);
    }

    public function test_members_edit_cannot_change_a_staff_account_email_without_users_manage(): void
    {
        $accountant = $this->memberWithRole('accountant', ['email' => 'accountant@example.com']);
        $this->actingAsStaff(['members.view', 'members.edit']);

        $this->patch(route('admin.members.update', $accountant->membership), ['name' => 'Acc Person', 'email' => 'mine@example.com'])->assertForbidden();
        $this->assertSame('accountant@example.com', $accountant->fresh()->email);

        // With the Users module's own permission the edit is allowed (same rule as /admin/users).
        $this->actingAsStaff(['members.view', 'members.edit', 'users.manage']);
        $this->patch(route('admin.members.update', $accountant->membership), ['name' => 'Acc Person', 'email' => 'renamed@example.com'])->assertRedirect()->assertSessionHasNoErrors();
        $this->assertSame('renamed@example.com', $accountant->fresh()->email);
    }

    public function test_super_admin_may_still_manage_every_membership(): void
    {
        $owner = $this->memberWithRole('owner', [], ['status' => MembershipStatus::Pending]);
        $this->actingAsRole('super-admin');

        $this->post(route('admin.members.approve', $owner->membership))->assertRedirect();
        $this->assertSame(MembershipStatus::Active, $owner->membership->fresh()->status);
    }

    public function test_staff_email_change_resets_verification_and_leaves_a_security_trail(): void
    {
        $member = $this->makeMember(['email' => 'before@example.com', 'mobile' => '01011111111', 'mobile_verified_at' => now()]);
        DB::table('password_reset_tokens')->insert(['email' => 'before@example.com', 'token' => 'x', 'created_at' => now()]);
        $staff = $this->actingAsStaff(['members.view', 'members.edit']);

        $this->patch(route('admin.members.update', $member->membership), [
            'name' => $member->name, 'email' => 'after@example.com', 'mobile' => '01022222222',
        ])->assertRedirect()->assertSessionHasNoErrors();

        $fresh = $member->fresh();
        $this->assertNull($fresh->email_verified_at);
        $this->assertNull($fresh->mobile_verified_at);
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => 'before@example.com']);
        $this->assertDatabaseHas('user_security_events', ['user_id' => $member->id, 'event_type' => 'email_changed_by_admin']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'members.profile_updated', 'actor_id' => $staff->id]);
    }

    public function test_locale_can_be_omitted_but_never_cleared(): void
    {
        $member = $this->makeMember(['preferred_locale' => 'en']);
        $this->actingAsStaff(['members.view', 'members.edit']);

        $this->patch(route('admin.members.update', $member->membership), ['name' => 'Some Person', 'email' => $member->email, 'preferred_locale' => null])
            ->assertSessionHasErrors('preferred_locale');
        $this->patch(route('admin.members.update', $member->membership), ['name' => 'Some Person', 'email' => $member->email])
            ->assertSessionHasNoErrors();

        $this->assertSame('en', $member->fresh()->preferred_locale);
    }

    public function test_staff_never_process_their_own_deletion_request(): void
    {
        $staff = $this->actingAsStaff(['members.view', 'members.delete_requests']);
        Membership::factory()->create(['user_id' => $staff->id]);
        $own = AccountDeletionRequest::create(['user_id' => $staff->id, 'status' => DeletionRequestStatus::Requested, 'requested_at' => now()]);
        $other = $this->makeMember();
        $foreign = AccountDeletionRequest::create(['user_id' => $other->id, 'status' => DeletionRequestStatus::Requested, 'requested_at' => now()]);

        $this->post(route('admin.members.deletion-requests.complete', $own), ['reason' => 'Self service attempt'])->assertForbidden();
        $this->post(route('admin.members.deletion-requests.reject', $own), ['reason' => 'Self service attempt'])->assertForbidden();
        $this->post(route('admin.members.deletion-requests.review', $own))->assertForbidden();
        $this->assertSame(DeletionRequestStatus::Requested, $own->fresh()->status);

        $this->get(route('admin.members.deletion-requests.index'))->assertOk()->assertInertia(fn ($page) => $page
            ->where('requests.data', fn ($rows) => collect($rows)->firstWhere('id', $own->public_id)['can_process'] === false
                && collect($rows)->firstWhere('id', $foreign->public_id)['can_process'] === true));
    }

    public function test_public_page_never_reveals_the_account_state(): void
    {
        $suspended = $this->makeMember([], ['status' => MembershipStatus::Suspended]);
        $token = app(MembershipQr::class)->token($suspended->membership);

        $this->get(route('shared.members.verify', ['token' => $token]))->assertOk()
            ->assertInertia(fn ($page) => $page->where('result', 'invalid')->where('member_number_masked', null));

        // The server-side log keeps the precise outcome for staff.
        $this->assertDatabaseHas('membership_verifications', ['membership_id' => $suspended->membership->id, 'purpose' => 'public', 'result' => 'not_active']);
    }

    public function test_unknown_consent_types_in_the_shared_log_do_not_break_the_privacy_pages(): void
    {
        $member = $this->actingAsMember();
        DB::table('consent_logs')->insert(['user_id' => $member->id, 'consent_type' => 'cookies_analytics', 'accepted_at' => now(), 'source' => 'web', 'created_at' => now()]);

        $this->get(route('member.privacy.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->where('history', fn ($rows) => collect($rows)->pluck('type')->doesntContain('cookies_analytics')));

        $this->actingAsStaff(['members.view']);
        $this->get(route('admin.members.show', $member->membership))->assertOk();
    }
}
