<?php

namespace Tests\Feature\Members;

use App\Models\User;
use App\Modules\Members\Actions\AnonymizeMember;
use App\Modules\Members\Events\MemberAnonymized;
use App\Modules\Members\Models\AccountDeletionRequest;
use App\Modules\Members\Models\ConsentLog;
use App\Modules\Members\Models\Enums\DeletionRequestStatus;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Membership;
use App\Modules\Members\Services\MembershipQr;
use App\Modules\Notifications\Models\Notification;
use App\Modules\System\Services\Settings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class PrivacyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Settings::flush();
    }

    public function test_privacy_page_shows_the_data_summary_consents_and_latest_request(): void
    {
        $member = $this->actingAsMember(['name' => 'Laila Samir', 'email' => 'laila@example.com']);

        $this->get(route('member.privacy.index'))->assertOk()->assertInertia(fn ($page) => $page->component('member/privacy/index')
            ->where('summary.name', 'Laila Samir')
            ->where('summary.email', 'laila@example.com')
            ->where('summary.member_number', $member->membership->member_number)
            ->where('marketing', ['marketing_email' => false, 'marketing_sms' => false, 'marketing_whatsapp' => false])
            ->has('history')
            ->where('deletion_request', null));
    }

    public function test_marketing_consents_append_accepted_and_withdrawn_rows(): void
    {
        $member = $this->actingAsMember();

        $this->put(route('member.privacy.consents'), ['marketing_email' => true, 'marketing_sms' => false])->assertSessionHasNoErrors();
        $this->assertSame(1, ConsentLog::query()->where('user_id', $member->id)->count());
        $granted = ConsentLog::query()->where('user_id', $member->id)->where('consent_type', 'marketing_email')->firstOrFail();
        $this->assertNotNull($granted->accepted_at);
        $this->assertNull($granted->withdrawn_at);

        // Re-sending the same state writes nothing.
        $this->put(route('member.privacy.consents'), ['marketing_email' => true])->assertSessionHasNoErrors();
        $this->assertSame(1, ConsentLog::query()->where('user_id', $member->id)->count());

        $this->put(route('member.privacy.consents'), ['marketing_email' => false, 'marketing_whatsapp' => true])->assertSessionHasNoErrors();
        $this->assertSame(3, ConsentLog::query()->where('user_id', $member->id)->count());
        $withdrawn = ConsentLog::query()->where('user_id', $member->id)->where('consent_type', 'marketing_email')->orderByDesc('id')->firstOrFail();
        $this->assertNull($withdrawn->accepted_at);
        $this->assertNotNull($withdrawn->withdrawn_at);
        $this->assertNotSame($granted->id, $withdrawn->id, 'consent history is append-only');

        $this->get(route('member.privacy.index'))->assertInertia(fn ($page) => $page->where('marketing', ['marketing_email' => false, 'marketing_sms' => false, 'marketing_whatsapp' => true]));
        $this->assertSame(2, DB::table('audit_logs')->where('action', 'members.consents_updated')->count());

        $this->put(route('member.privacy.consents'), ['marketing_email' => 'maybe'])->assertSessionHasErrors('marketing_email');
    }

    public function test_deactivation_requires_the_current_password_and_logs_out_everywhere(): void
    {
        config(['session.driver' => 'database']);
        $member = $this->actingAsMember();
        DB::table('sessions')->insert(['id' => 'phone', 'user_id' => $member->id, 'ip_address' => '10.0.0.9', 'user_agent' => 'phone', 'payload' => 'x', 'last_activity' => time()]);

        $this->post(route('member.privacy.deactivate'), ['current_password' => 'wrong-password'])->assertSessionHasErrors('current_password');
        $this->assertTrue($member->fresh()->isActive());

        $this->post(route('member.privacy.deactivate'), ['current_password' => 'password', 'reason' => 'Sold my car'])->assertRedirect(route('login'));

        $this->assertGuest();
        $user = $member->fresh();
        $this->assertSame(User::STATUS_DISABLED, $user->status);
        $this->assertSame($member->id, $user->disabled_by);
        $this->assertSame(0, DB::table('sessions')->where('user_id', $member->id)->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'members.self_deactivated', 'actor_id' => $member->id, 'reason' => 'Sold my car']);
        $this->assertDatabaseHas('user_security_events', ['user_id' => $member->id, 'event_type' => 'account_disabled']);
        $this->assertSame(MembershipStatus::Active, $user->membership->status, 'membership history is kept');

        // A disabled account can no longer sign in.
        $this->post(route('login.store'), ['email' => $user->email, 'password' => 'password']);
        $this->assertGuest();
    }

    public function test_deletion_request_needs_acknowledgement_and_only_one_can_be_open(): void
    {
        $member = $this->actingAsMember();

        $this->post(route('member.privacy.deletion-request'), ['reason' => 'Leaving Egypt'])->assertSessionHasErrors('acknowledge');
        $this->post(route('member.privacy.deletion-request'), ['reason' => 'Leaving Egypt', 'acknowledge' => '1'])->assertSessionHasNoErrors();
        $this->post(route('member.privacy.deletion-request'), ['acknowledge' => '1'])->assertSessionHasErrors('domain');

        $request = AccountDeletionRequest::query()->where('user_id', $member->id)->sole();
        $this->assertSame(DeletionRequestStatus::Requested, $request->status);
        $this->assertSame('Leaving Egypt', $request->reason);
        $this->assertDatabaseHas('audit_logs', ['action' => 'members.deletion_requested', 'actor_id' => $member->id]);
        $this->assertSame(1, Notification::query()->where('user_id', $member->id)->where('key', 'members.deletion_requested')->count());

        $this->get(route('member.privacy.index'))->assertInertia(fn ($page) => $page->where('deletion_request.status', 'requested'));
    }

    public function test_admin_processes_a_deletion_request_and_anonymisation_keeps_membership_and_audit_rows(): void
    {
        config(['session.driver' => 'database']);
        Event::fake([MemberAnonymized::class]);
        $member = $this->makeMember(['name' => 'Karim Adel', 'email' => 'karim@example.com', 'mobile' => '01055554444'], ['referral_source' => 'Friend Ahmed']);
        $membership = $member->membership;
        $token = app(MembershipQr::class)->token($membership);
        $member->createToken('api');
        DB::table('sessions')->insert(['id' => 'karim', 'user_id' => $member->id, 'ip_address' => '10.0.0.3', 'user_agent' => 'x', 'payload' => 'x', 'last_activity' => time()]);
        $request = AccountDeletionRequest::create(['user_id' => $member->id, 'status' => DeletionRequestStatus::Requested, 'reason' => 'Please delete', 'requested_at' => now()]);
        DB::table('audit_logs')->insert(['action' => 'orders.created', 'entity_type' => 'order', 'entity_id' => 1, 'actor_id' => $member->id, 'actor_type' => 'user', 'created_at' => now()]);
        $auditBefore = DB::table('audit_logs')->count();

        $staff = $this->actingAsStaff(['members.view', 'members.delete_requests']);

        $this->get(route('admin.members.deletion-requests.index'))->assertOk()->assertInertia(fn ($page) => $page->component('admin/members/deletion-requests')
            ->has('requests.data', 1)
            ->where('requests.data.0.id', $request->public_id)
            ->where('requests.data.0.user.member_number', $membership->member_number)
            ->where('counts.requested', 1));

        $this->post(route('admin.members.deletion-requests.review', $request))->assertSessionHasNoErrors();
        $this->assertSame(DeletionRequestStatus::UnderReview, $request->fresh()->status);

        $this->post(route('admin.members.deletion-requests.complete', $request), ['reason' => 'ok'])->assertSessionHasErrors('reason');
        $this->post(route('admin.members.deletion-requests.complete', $request), ['reason' => 'Verified identity by phone', 'notes' => 'Financial records retained'])->assertSessionHasNoErrors();

        $user = $member->fresh();
        $this->assertSame(AnonymizeMember::ANONYMIZED_NAME, $user->name);
        $this->assertSame("deleted-{$member->id}@anonymized.local", $user->email);
        $this->assertNull($user->mobile);
        $this->assertSame(User::STATUS_DISABLED, $user->status);
        $this->assertSame(0, $user->tokens()->count());
        $this->assertSame(0, DB::table('sessions')->where('user_id', $member->id)->count());

        // Membership row, status history and every audit row survive.
        $kept = Membership::query()->findOrFail($membership->id);
        $this->assertSame($membership->member_number, $kept->member_number);
        $this->assertNull($kept->referral_source);
        $this->assertGreaterThan($auditBefore, DB::table('audit_logs')->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'orders.created', 'actor_id' => $member->id]);
        $audit = DB::table('audit_logs')->where('action', 'members.anonymized')->where('entity_id', $membership->id)->first();
        $this->assertNotNull($audit);
        $this->assertSame($staff->id, $audit->actor_id);
        $this->assertSame('Verified identity by phone', $audit->reason);
        foreach (['Karim Adel', 'karim@example.com', '01055554444'] as $pii) {
            $this->assertStringNotContainsString($pii, (string) $audit->old_values.$audit->new_values, 'the immutable audit row must not keep erased PII');
        }

        $processed = $request->fresh();
        $this->assertSame(DeletionRequestStatus::Completed, $processed->status);
        $this->assertSame($staff->id, $processed->processed_by);
        $this->assertSame('Financial records retained', $processed->notes);
        $this->assertSame('invalid', app(MembershipQr::class)->verify($token)['reason'], 'every issued card stops verifying');
        Event::assertDispatched(MemberAnonymized::class, fn (MemberAnonymized $event) => $event->membership->id === $membership->id && $event->deletionRequestId === $request->id);

        // Completing again is a no-op; rejecting a completed request is refused.
        $this->post(route('admin.members.deletion-requests.complete', $request), ['reason' => 'Clicked twice by mistake'])->assertSessionHasNoErrors();
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'members.anonymized')->count());
        $this->post(route('admin.members.deletion-requests.reject', $request), ['reason' => 'Changed my mind'])->assertSessionHasErrors('domain');
    }

    public function test_rejecting_a_deletion_request_requires_a_reason_and_notifies_the_member(): void
    {
        $member = $this->makeMember();
        $request = AccountDeletionRequest::create(['user_id' => $member->id, 'status' => DeletionRequestStatus::Requested, 'requested_at' => now()]);
        $this->actingAsStaff(['members.delete_requests']);

        $this->post(route('admin.members.deletion-requests.reject', $request))->assertSessionHasErrors('reason');
        $this->post(route('admin.members.deletion-requests.reject', $request), ['reason' => 'Open orders must be delivered first'])->assertSessionHasNoErrors();

        $this->assertSame(DeletionRequestStatus::Rejected, $request->fresh()->status);
        $this->assertTrue($member->fresh()->isActive());
        $this->assertDatabaseHas('audit_logs', ['action' => 'members.deletion_request_rejected', 'reason' => 'Open orders must be delivered first']);
        $this->assertSame(1, Notification::query()->where('user_id', $member->id)->where('key', 'members.deletion_rejected')->count());

        // A new request can be filed after a rejection.
        $this->actingAs($member);
        $this->post(route('member.privacy.deletion-request'), ['acknowledge' => '1'])->assertSessionHasNoErrors();
        $this->assertSame(2, AccountDeletionRequest::query()->where('user_id', $member->id)->count());
    }

    public function test_deletion_request_list_filters_by_status_and_search(): void
    {
        $a = $this->makeMember(['name' => 'Hoda Kamal']);
        $b = $this->makeMember(['name' => 'Yasser Omar']);
        AccountDeletionRequest::create(['user_id' => $a->id, 'status' => DeletionRequestStatus::Requested, 'requested_at' => now()]);
        AccountDeletionRequest::create(['user_id' => $b->id, 'status' => DeletionRequestStatus::Rejected, 'requested_at' => now()->subDay(), 'processed_at' => now()]);
        $this->actingAsStaff(['members.delete_requests']);

        $this->get(route('admin.members.deletion-requests.index', ['status' => 'rejected']))->assertInertia(fn ($page) => $page->has('requests.data', 1)->where('requests.data.0.user.name', 'Yasser Omar'));
        $this->get(route('admin.members.deletion-requests.index', ['search' => 'Hoda']))->assertInertia(fn ($page) => $page->has('requests.data', 1)->where('requests.data.0.status', 'requested'));
        $this->get(route('admin.members.deletion-requests.index', ['status' => 'nope']))->assertSessionHasErrors('status');
    }
}
