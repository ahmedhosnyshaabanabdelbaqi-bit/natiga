<?php

namespace Tests\Feature\Referrals;

use App\Modules\Members\Actions\ChangeMembershipStatus;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Membership;
use App\Modules\Referrals\Models\Enums\ReferralStatus;
use App\Modules\Referrals\Models\MemberReferral;
use App\Modules\Referrals\Services\ReferralService;
use App\Modules\System\Services\Settings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ReferralTrackingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Settings::flush();
        $this->syncRbac();
    }

    /** @return array<string, string> */
    private function registration(string $email, ?string $code): array
    {
        return array_filter([
            'name' => 'Referred Friend',
            'email' => $email,
            'mobile' => '010'.substr((string) crc32($email), 0, 8),
            'password' => 'password',
            'password_confirmation' => 'password',
            'terms' => '1',
            'invitation_code' => $code,
        ], fn ($value) => $value !== null);
    }

    public function test_registration_with_a_referral_code_creates_a_tracking_row_and_approval_flips_it(): void
    {
        $referrer = $this->makeMember(['name' => 'Referrer Mona']);
        $code = $referrer->membership->referral_code;

        $this->get(route('register', ['ref' => $code]))->assertOk()->assertInertia(fn ($page) => $page->where('invitationCode', $code));
        $this->post(route('register.store'), $this->registration('friend@example.com', strtolower($code)))->assertRedirect();

        $referred = Membership::query()->whereRelation('user', 'email', 'friend@example.com')->firstOrFail();
        $this->assertSame($referrer->membership->id, $referred->referred_by);
        $this->assertSame(MembershipStatus::Pending, $referred->status);

        $referral = MemberReferral::query()->where('referred_membership_id', $referred->id)->sole();
        $this->assertSame($referrer->membership->id, $referral->referrer_membership_id);
        $this->assertSame($code, $referral->referral_code_used);
        $this->assertSame(ReferralStatus::Registered, $referral->status);
        $this->assertNull($referral->approved_at);

        $staff = $this->makeStaff(['members.approve']);
        app(ChangeMembershipStatus::class)->execute($referred, MembershipStatus::Active, $staff);

        $referral->refresh();
        $this->assertSame(ReferralStatus::Approved, $referral->status);
        $this->assertNotNull($referral->approved_at);
    }

    public function test_registration_without_or_with_an_unknown_code_creates_no_referral(): void
    {
        $this->post(route('register.store'), $this->registration('solo@example.com', null))->assertRedirect();
        $this->post(route('register.store'), $this->registration('unknown@example.com', 'EVNOPE12'))->assertRedirect();

        $this->assertSame(0, MemberReferral::query()->count());
        $this->assertNull(Membership::query()->whereRelation('user', 'email', 'unknown@example.com')->value('referred_by'));
    }

    public function test_a_code_of_a_non_active_member_is_not_accepted(): void
    {
        $suspended = $this->makeMember([], ['status' => MembershipStatus::Suspended]);

        $this->post(route('register.store'), $this->registration('late@example.com', $suspended->membership->referral_code))->assertRedirect();

        $this->assertSame(0, MemberReferral::query()->count());
    }

    public function test_recording_is_idempotent_and_approval_writes_once(): void
    {
        $referrer = $this->makeMember();
        $referred = $this->makeMember([], ['status' => MembershipStatus::Pending, 'referred_by' => $referrer->membership->id])->membership;
        $service = app(ReferralService::class);

        $first = $service->recordRegistration($referred);
        $second = $service->recordRegistration($referred);
        $this->assertSame($first->id, $second->id);
        $this->assertSame(1, MemberReferral::query()->count());

        $referred->forceFill(['status' => MembershipStatus::Active])->save();
        $approved = $service->markApproved($referred);
        $approvedAt = $approved->fresh()->approved_at;
        $this->travel(5)->minutes();
        $again = $service->markApproved($referred);
        $this->assertTrue($approvedAt->equalTo($again->fresh()->approved_at));
        $this->assertSame(1, MemberReferral::query()->count());
    }

    public function test_self_referral_is_impossible(): void
    {
        $member = $this->makeMember();
        $membership = $member->membership;
        $membership->forceFill(['referred_by' => $membership->id])->save();

        $this->assertNull(app(ReferralService::class)->recordRegistration($membership));
        $this->assertSame(0, MemberReferral::query()->count());
    }

    public function test_member_page_shows_code_share_link_counters_and_first_names_only(): void
    {
        $referrer = $this->actingAsMember();
        $code = $referrer->membership->referral_code;
        $approved = $this->makeMember(['name' => 'Omar Khaled Hassan', 'email' => 'omar@example.com'], ['referred_by' => $referrer->membership->id]);
        $pending = $this->makeMember(['name' => 'Nadia Fouad'], ['status' => MembershipStatus::Pending, 'referred_by' => $referrer->membership->id]);
        $service = app(ReferralService::class);
        $service->markApproved($approved->membership);
        $service->recordRegistration($pending->membership);
        // A membership referred before tracking existed is back-filled lazily.
        $this->makeMember(['name' => 'Legacy Friend'], ['status' => MembershipStatus::Pending, 'referred_by' => $referrer->membership->id]);

        $response = $this->get(route('member.referrals.index'))->assertOk();
        $response->assertInertia(fn ($page) => $page->component('member/referrals/index')
            ->where('referral_code', $code)
            ->where('share_link', route('register', ['ref' => $code]))
            ->where('stats', ['invited' => 3, 'registered' => 3, 'approved' => 1])
            ->has('referred', 3)
            ->where('referred.2.first_name', 'Omar')
            ->where('referred.2.status', 'approved'));
        $this->assertSame(['first_name', 'status', 'joined_at'], array_keys($response->viewData('page')['props']['referred'][0]));
        $content = $response->getContent();
        foreach (['Khaled', 'omar@example.com', $approved->membership->member_number, (string) $approved->mobile] as $private) {
            $this->assertStringNotContainsString($private, $content);
        }
        $this->assertSame(3, MemberReferral::query()->where('referrer_membership_id', $referrer->membership->id)->count());
    }

    public function test_member_page_is_hidden_when_the_programme_is_disabled(): void
    {
        $this->actingAsMember();
        Settings::set('referrals.enabled', false);

        $this->get(route('member.referrals.index'))->assertNotFound();
        $this->get(route('member.dashboard'))->assertInertia(fn ($page) => $page->where('referrals_enabled', false));
    }

    public function test_admin_referrals_list_requires_permission_and_supports_filters(): void
    {
        $referrer = $this->makeMember(['name' => 'Tamer Referrer']);
        $a = $this->makeMember(['name' => 'Ali Referred'], ['referred_by' => $referrer->membership->id]);
        $b = $this->makeMember(['name' => 'Sara Referred'], ['status' => MembershipStatus::Pending, 'referred_by' => $referrer->membership->id]);
        app(ReferralService::class)->markApproved($a->membership);
        app(ReferralService::class)->recordRegistration($b->membership);

        $this->actingAsStaff(['members.view']);
        $this->get(route('admin.referrals.index'))->assertForbidden();

        $this->actingAsStaff(['referrals.view']);
        $this->get(route('admin.referrals.index'))->assertOk()->assertInertia(fn ($page) => $page->component('admin/referrals/index')
            ->has('referrals.data', 2)
            ->where('counts', ['total' => 2, 'invited' => 0, 'registered' => 1, 'approved' => 1])
            ->where('referrals.data.0.referrer.name', 'Tamer Referrer'));
        $this->get(route('admin.referrals.index', ['status' => 'approved']))->assertInertia(fn ($page) => $page->has('referrals.data', 1)->where('referrals.data.0.referred.name', 'Ali Referred'));
        $this->get(route('admin.referrals.index', ['search' => 'Sara']))->assertInertia(fn ($page) => $page->has('referrals.data', 1));
        $this->get(route('admin.referrals.index', ['status' => 'paid']))->assertSessionHasErrors('status');
    }

    public function test_referral_rows_carry_no_monetary_columns(): void
    {
        $columns = DB::getSchemaBuilder()->getColumnListing('member_referrals');

        foreach ($columns as $column) {
            $this->assertDoesNotMatchRegularExpression('/amount|reward|credit|currency/', $column);
        }
        $this->assertContains('referral_code_used', $columns);
    }

    public function test_referrals_are_invisible_to_other_members(): void
    {
        $referrer = $this->makeMember();
        $friend = $this->makeMember(['name' => 'Secret Friend'], ['referred_by' => $referrer->membership->id]);
        app(ReferralService::class)->recordRegistration($friend->membership);
        $other = $this->actingAsMember();

        $response = $this->get(route('member.referrals.index'))->assertOk();
        $response->assertInertia(fn ($page) => $page->where('referral_code', $other->membership->referral_code)->has('referred', 0));
        $this->assertStringNotContainsString('Secret', $response->getContent());
    }
}
