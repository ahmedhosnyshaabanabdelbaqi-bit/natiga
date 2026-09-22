<?php

namespace Tests\Feature\Members;

use App\Models\User;
use App\Modules\Members\Models\AccountDeletionRequest;
use App\Modules\Members\Models\Enums\DeletionRequestStatus;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\MemberNote;
use App\Modules\System\Services\Settings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Server-side authorization and IDOR protection for every members route. */
class MemberAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Settings::flush(); // the settings service memoises values in a static between tests
    }

    public function test_member_cannot_open_admin_member_pages(): void
    {
        $other = $this->makeMember();
        $this->actingAsMember();

        $this->get(route('admin.members.show', $other->membership))->assertForbidden();
        $this->get(route('admin.members.index'))->assertForbidden();
        $this->post(route('admin.members.approve', $other->membership))->assertForbidden();
        $this->get(route('admin.members.export'))->assertForbidden();
    }

    public function test_staff_without_members_view_gets_403(): void
    {
        $member = $this->makeMember();
        $this->actingAsStaff(['orders.view']);

        $this->get(route('admin.members.index'))->assertForbidden();
        $this->get(route('admin.members.pending'))->assertForbidden();
        $this->get(route('admin.members.show', $member->membership))->assertForbidden();
    }

    public function test_view_only_staff_cannot_change_anything(): void
    {
        $member = $this->makeMember([], ['status' => MembershipStatus::Pending]);
        $this->actingAsStaff(['members.view']);

        $this->get(route('admin.members.show', $member->membership))->assertOk();
        $this->post(route('admin.members.approve', $member->membership))->assertForbidden();
        $this->post(route('admin.members.reject', $member->membership), ['reason' => 'Not eligible'])->assertForbidden();
        $this->patch(route('admin.members.update', $member->membership), ['name' => 'X Y Z', 'email' => 'x@example.com'])->assertForbidden();
        $this->post(route('admin.members.notes.store', $member->membership), ['body' => 'hello'])->assertForbidden();
        $this->post(route('admin.members.bulk-approve'), ['ids' => [$member->membership->public_id]])->assertForbidden();
        $this->get(route('admin.members.export'))->assertForbidden();
        $this->get(route('admin.members.scan'))->assertForbidden();
        $this->get(route('admin.members.deletion-requests.index'))->assertForbidden();

        $this->assertSame(MembershipStatus::Pending, $member->membership->fresh()->status);
    }

    public function test_members_are_addressed_by_public_id_only(): void
    {
        $member = $this->makeMember();
        $this->actingAsStaff(['members.view']);

        $this->get('/admin/members/'.$member->membership->id)->assertNotFound();
        $this->get('/admin/members/'.$member->membership->public_id)->assertOk();
    }

    public function test_note_from_another_membership_cannot_be_pinned_through_a_different_member(): void
    {
        $a = $this->makeMember();
        $b = $this->makeMember();
        $note = MemberNote::create(['membership_id' => $b->membership->id, 'body' => 'private to B', 'is_pinned' => false, 'created_at' => now()]);
        $this->actingAsStaff(['members.view', 'members.notes']);

        $this->patch(route('admin.members.notes.pin', ['membership' => $a->membership, 'note' => $note->id]))->assertNotFound();
        $this->assertFalse($note->fresh()->is_pinned);
    }

    public function test_deletion_requests_need_the_dedicated_permission(): void
    {
        $member = $this->makeMember();
        $request = AccountDeletionRequest::create(['user_id' => $member->id, 'status' => DeletionRequestStatus::Requested, 'requested_at' => now()]);
        $this->actingAsStaff(['members.view', 'members.edit', 'members.approve']);

        $this->get(route('admin.members.deletion-requests.index'))->assertForbidden();
        $this->post(route('admin.members.deletion-requests.complete', $request), ['reason' => 'Member asked for it'])->assertForbidden();
        $this->assertSame(DeletionRequestStatus::Requested, $request->fresh()->status);
    }

    public function test_default_roles_receive_the_documented_permissions(): void
    {
        $this->syncRbac();
        $ops = User::factory()->withTwoFactor()->create();
        $ops->assignRole('operations-manager');
        $support = User::factory()->withTwoFactor()->create();
        $support->assignRole('support-agent');
        $accountant = User::factory()->withTwoFactor()->create();
        $accountant->assignRole('accountant');

        foreach (['members.view', 'members.edit', 'members.approve', 'members.suspend', 'members.export', 'members.verify', 'members.notes', 'members.delete_requests'] as $permission) {
            $this->assertTrue($ops->can($permission), "operations-manager lacks {$permission}");
        }
        foreach (['members.view', 'members.notes', 'members.verify'] as $permission) {
            $this->assertTrue($support->can($permission), "support-agent lacks {$permission}");
        }
        foreach (['members.approve', 'members.suspend', 'members.export', 'members.delete_requests', 'members.edit'] as $permission) {
            $this->assertFalse($support->can($permission), "support-agent must not have {$permission}");
        }
        $this->assertTrue($accountant->can('members.view'));
        $this->assertFalse($accountant->can('members.edit'));
        $this->assertFalse($accountant->can('members.verify'));
    }

    public function test_guests_are_redirected_to_login_for_every_portal_route(): void
    {
        $member = $this->makeMember();

        foreach ([
            $this->get(route('admin.members.show', $member->membership)),
            $this->get(route('member.membership-card')),
            $this->post(route('partner.members.verify'), ['token' => str_repeat('a', 30)]),
        ] as $response) {
            $response->assertRedirect();
            $this->assertStringContainsString('login', (string) $response->headers->get('Location'));
        }
        $this->assertGuest();
    }

    public function test_members_and_staff_cannot_use_the_partner_scanner(): void
    {
        $this->actingAsMember();
        $this->get(route('partner.members.scan'))->assertForbidden();

        $this->actingAsStaff(['members.verify']);
        $this->get(route('partner.members.scan'))->assertForbidden();
        $this->postJson(route('partner.members.verify'), ['token' => str_repeat('a', 30)])->assertForbidden();
    }
}
