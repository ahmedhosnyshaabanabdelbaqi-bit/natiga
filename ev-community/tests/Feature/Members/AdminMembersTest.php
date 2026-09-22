<?php

namespace Tests\Feature\Members;

use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\MemberNote;
use App\Modules\Members\Services\MembersExport;
use App\Modules\System\Services\Settings;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AdminMembersTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Settings::flush();
    }

    public function test_index_lists_members_with_counts_filters_and_whitelisted_sorting(): void
    {
        $alice = $this->makeMember(['name' => 'Alice Nour', 'email' => 'alice@example.com'], ['joined_at' => now()->subDays(3), 'referral_source' => 'facebook']);
        $bob = $this->makeMember(['name' => 'Bob Hany'], ['status' => MembershipStatus::Pending, 'joined_at' => now()->subDay(), 'referral_source' => 'friend']);
        $this->makeMember(['name' => 'Carol Samy'], ['status' => MembershipStatus::Suspended, 'referral_source' => 'search']);
        $this->actingAsStaff(['members.view']);

        $this->get(route('admin.members.index'))->assertOk()->assertInertia(fn ($page) => $page->component('admin/members/index')
            ->has('members.data', 3)
            ->where('counts.total', 3)
            ->where('counts.active', 1)
            ->where('counts.pending', 1)
            ->where('counts.suspended', 1)
            ->has('statuses', 5)
            ->has('governorates')
            ->has('referral_sources'));

        $this->get(route('admin.members.index', ['search' => 'alice@']))->assertInertia(fn ($page) => $page->has('members.data', 1)->where('members.data.0.id', $alice->membership->public_id));
        $this->get(route('admin.members.index', ['search' => $bob->membership->member_number]))->assertInertia(fn ($page) => $page->has('members.data', 1)->where('members.data.0.name', 'Bob Hany'));
        $this->get(route('admin.members.index', ['status' => 'pending']))->assertInertia(fn ($page) => $page->has('members.data', 1)->where('filters.status', 'pending'));
        $this->get(route('admin.members.index', ['referral_source' => 'facebook']))->assertInertia(fn ($page) => $page->has('members.data', 1));
        $this->get(route('admin.members.index', ['sort' => 'name', 'direction' => 'asc']))->assertInertia(fn ($page) => $page->where('members.data.0.name', 'Alice Nour')->where('members.data.2.name', 'Carol Samy'));
        $this->get(route('admin.members.index', ['sort' => 'name', 'direction' => 'desc']))->assertInertia(fn ($page) => $page->where('members.data.0.name', 'Carol Samy'));
        $this->get(route('admin.members.index', ['joined_from' => now()->subDays(2)->toDateString()]))->assertInertia(fn ($page) => $page->has('members.data', 2));

        // Anything outside the whitelist is a validation error, never raw SQL.
        $this->get(route('admin.members.index', ['sort' => 'password']))->assertSessionHasErrors('sort');
        $this->get(route('admin.members.index', ['direction' => 'sideways']))->assertSessionHasErrors('direction');
        $this->get(route('admin.members.index', ['status' => 'deleted']))->assertSessionHasErrors('status');
        $this->get(route('admin.members.index', ['search' => "%' OR 1=1 --"]))->assertOk()->assertInertia(fn ($page) => $page->has('members.data', 0));
    }

    public function test_pending_page_lists_only_pending_oldest_first(): void
    {
        $newer = $this->makeMember([], ['status' => MembershipStatus::Pending, 'joined_at' => now()->subHour()]);
        $older = $this->makeMember([], ['status' => MembershipStatus::Pending, 'joined_at' => now()->subDays(2)]);
        $this->makeMember();
        $this->actingAsStaff(['members.view']);

        $this->get(route('admin.members.pending'))->assertOk()->assertInertia(fn ($page) => $page->component('admin/members/pending')
            ->has('members.data', 2)
            ->where('members.data.0.id', $older->membership->public_id)
            ->where('members.data.1.id', $newer->membership->public_id)
            ->where('filters.status', 'pending'));
    }

    public function test_show_page_contains_every_tab_and_hides_security_events_without_permission(): void
    {
        $referrer = $this->makeMember(['name' => 'Referrer Person']);
        $member = $this->makeMember([], ['referred_by' => $referrer->membership->id]);
        MemberNote::create(['membership_id' => $member->membership->id, 'body' => 'Called about pickup', 'is_pinned' => true, 'created_at' => now()]);
        $this->actingAsStaff(['members.view']);

        $this->get(route('admin.members.show', $member->membership))->assertOk()->assertInertia(fn ($page) => $page->component('admin/members/show')
            ->where('membership.id', $member->membership->public_id)
            ->where('membership.referred_by.name', 'Referrer Person')
            ->where('membership.allowed_transitions', ['suspended', 'expired'])
            ->has('history')
            ->has('verifications')
            ->has('notes', 1)
            ->has('consents')
            ->has('marketing')
            ->where('security_events', null)
            ->has('deletion_requests')
            ->has('governorates')
            ->where('locales', ['ar', 'en']));

        $this->actingAsStaff(['members.view', 'security_events.view']);
        $this->get(route('admin.members.show', $member->membership))->assertInertia(fn ($page) => $page->has('security_events'));
    }

    public function test_notes_can_be_added_and_pinned_with_audit(): void
    {
        $member = $this->makeMember();
        $staff = $this->actingAsStaff(['members.view', 'members.notes']);

        $this->post(route('admin.members.notes.store', $member->membership), ['body' => ''])->assertSessionHasErrors('body');
        $this->post(route('admin.members.notes.store', $member->membership), ['body' => 'Prefers WhatsApp contact'])->assertSessionHasNoErrors();

        $note = MemberNote::query()->where('membership_id', $member->membership->id)->firstOrFail();
        $this->assertSame($staff->id, $note->author_id);
        $this->assertFalse($note->is_pinned);

        $this->patch(route('admin.members.notes.pin', ['membership' => $member->membership, 'note' => $note->id]))->assertRedirect();
        $this->assertTrue($note->fresh()->is_pinned);
        $this->assertDatabaseHas('audit_logs', ['action' => 'members.note_added', 'entity_id' => $member->membership->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'members.note_pinned', 'entity_id' => $member->membership->id]);
    }

    public function test_profile_edit_is_validated_and_audited_with_old_and_new_values(): void
    {
        $member = $this->makeMember(['name' => 'Old Name', 'email' => 'old@example.com', 'mobile' => '01000000001']);
        $taken = $this->makeMember(['email' => 'taken@example.com']);
        $staff = $this->actingAsStaff(['members.view', 'members.edit']);

        $this->patch(route('admin.members.update', $member->membership), ['name' => 'New Name', 'email' => 'taken@example.com'])->assertSessionHasErrors('email');
        $this->patch(route('admin.members.update', $member->membership), ['name' => 'New Name', 'email' => ' Taken@Example.COM '])->assertSessionHasErrors('email');
        $this->patch(route('admin.members.update', $member->membership), ['name' => 'New Name', 'email' => 'old@example.com', 'mobile' => '12345'])->assertSessionHasErrors('mobile');

        $this->patch(route('admin.members.update', $member->membership), [
            'name' => 'New Name',
            'email' => 'NEW@example.com',
            'mobile' => '+20 100 000 0002',
            'preferred_locale' => 'en',
            'reason' => 'Member called support',
        ])->assertSessionHasNoErrors();

        $user = $member->fresh();
        $this->assertSame('New Name', $user->name);
        $this->assertSame('new@example.com', $user->email);
        $this->assertSame('01000000002', $user->mobile);
        $this->assertNull($user->email_verified_at, 'a changed email must be verified again');

        $audit = DB::table('audit_logs')->where('action', 'members.profile_updated')->where('entity_id', $member->membership->id)->first();
        $this->assertNotNull($audit);
        $this->assertSame($staff->id, $audit->actor_id);
        $this->assertSame('Member called support', $audit->reason);
        $this->assertSame('Old Name', json_decode($audit->old_values, true)['name']);
        $this->assertSame('New Name', json_decode($audit->new_values, true)['name']);
        $this->assertNotSame($taken->id, $user->id);
    }

    public function test_export_requires_permission_streams_filtered_csv_and_is_audited(): void
    {
        $this->makeMember(['name' => 'Active One']);
        $this->makeMember(['name' => '=HYPERLINK("http://evil")'], ['status' => MembershipStatus::Pending]);

        $this->actingAsStaff(['members.view']);
        $this->get(route('admin.members.export'))->assertForbidden();

        $staff = $this->actingAsStaff(['members.view', 'members.export']);
        $response = $this->get(route('admin.members.export', ['status' => 'pending']));
        $response->assertOk();
        $this->assertStringContainsString('text/csv', (string) $response->headers->get('Content-Type'));
        $csv = $response->streamedContent();
        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);
        $this->assertStringNotContainsString('Active One', $csv);
        $this->assertStringContainsString("'=HYPERLINK", $csv, 'formula injection is neutralised');

        $audit = DB::table('audit_logs')->where('action', 'members.exported')->where('actor_id', $staff->id)->first();
        $this->assertNotNull($audit);
        $this->assertEquals(['filters' => ['status' => 'pending'], 'rows' => 1], json_decode($audit->new_values, true));
    }

    public function test_csv_cell_sanitiser(): void
    {
        $this->assertSame("'=1+2", MembersExport::cell('=1+2'));
        $this->assertSame("'@SUM(A1)", MembersExport::cell('@SUM(A1)'));
        $this->assertSame("'-3", MembersExport::cell('-3'));
        $this->assertSame('01012345678', MembersExport::cell('01012345678'));
        $this->assertSame('', MembersExport::cell(null));
    }

    public function test_resend_verification_and_rotate_token_are_audited(): void
    {
        Notification::fake();
        $member = $this->makeMember(['email_verified_at' => null]);
        $verified = $this->makeMember();
        $this->actingAsStaff(['members.view', 'members.edit']);

        $this->post(route('admin.members.resend-verification', $member->membership))->assertSessionHas('success');
        Notification::assertSentTo($member, VerifyEmail::class);
        $this->post(route('admin.members.resend-verification', $verified->membership))->assertSessionHas('warning');
        $this->assertDatabaseHas('audit_logs', ['action' => 'members.verification_email_resent', 'entity_id' => $member->membership->id]);

        $token = $member->membership->verification_token;
        $this->post(route('admin.members.rotate-token', $member->membership))->assertSessionHas('success');
        $this->assertNotSame($token, $member->membership->fresh()->verification_token);
        $this->assertDatabaseHas('audit_logs', ['action' => 'members.qr_token_rotated', 'entity_id' => $member->membership->id]);
    }

    public function test_scan_page_renders_for_verifiers(): void
    {
        $this->actingAsStaff(['members.verify']);

        $this->get(route('admin.members.scan'))->assertOk()->assertInertia(fn ($page) => $page->component('admin/members/scan')
            ->has('purposes', 5)
            ->where('purposes.0.value', 'membership'));
    }

    public function test_verification_token_never_reaches_the_admin_page(): void
    {
        $member = $this->makeMember();
        $this->actingAsStaff(['members.view']);

        $response = $this->get(route('admin.members.show', $member->membership));
        $this->assertStringNotContainsString($member->membership->verification_token, $response->getContent());
    }
}
