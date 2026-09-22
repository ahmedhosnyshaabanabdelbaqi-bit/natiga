<?php

namespace Tests\Feature\Members;

use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\System\Services\Settings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class MemberPortalTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Settings::flush();
    }

    private function governorateId(): int
    {
        DB::table('countries')->updateOrInsert(['code' => 'EG'], ['name_ar' => 'مصر', 'name_en' => 'Egypt', 'dial_code' => '+20', 'is_active' => true]);
        DB::table('governorates')->updateOrInsert(['code' => 'ALX'], ['country_code' => 'EG', 'name_ar' => 'الإسكندرية', 'name_en' => 'Alexandria', 'sort_order' => 2, 'is_active' => true]);

        return (int) DB::table('governorates')->where('code', 'ALX')->value('id');
    }

    public function test_dashboard_nudges_members_with_missing_mobile_or_governorate(): void
    {
        $this->actingAsMember(['mobile' => null]);

        $this->get(route('member.dashboard'))->assertOk()->assertInertia(fn ($page) => $page->component('member/dashboard')
            ->where('profile.mobile_missing', true)
            ->where('profile.governorate_missing', true)
            ->where('referrals_enabled', true)
            ->has('kpis'));

        $this->actingAsMember([], ['governorate_id' => $this->governorateId()]);
        $this->get(route('member.dashboard'))->assertInertia(fn ($page) => $page->where('profile.mobile_missing', false)->where('profile.governorate_missing', false));
    }

    public function test_member_updates_own_profile_with_normalised_mobile_and_audit(): void
    {
        $member = $this->actingAsMember(['mobile' => null]);
        $governorate = $this->governorateId();

        $this->get(route('member.profile.edit'))->assertOk()->assertInertia(fn ($page) => $page->component('member/profile/edit')
            ->where('profile.member_number', $member->membership->member_number)
            ->where('require_mobile', true)
            ->has('governorates'));

        $this->patch(route('member.profile.update'), ['preferred_locale' => 'ar'])->assertSessionHasErrors('mobile');
        $this->patch(route('member.profile.update'), ['mobile' => '0123', 'preferred_locale' => 'ar'])->assertSessionHasErrors('mobile');
        $this->patch(route('member.profile.update'), ['mobile' => '01012345678', 'preferred_locale' => 'fr'])->assertSessionHasErrors('preferred_locale');

        $this->patch(route('member.profile.update'), [
            'mobile' => '+201012345678',
            'governorate_id' => $governorate,
            'preferred_locale' => 'en',
            'referral_source' => 'Facebook group',
        ])->assertRedirect(route('member.profile.edit'))->assertSessionHasNoErrors();

        $user = $member->fresh();
        $this->assertSame('01012345678', $user->mobile);
        $this->assertSame('en', $user->preferred_locale);
        $this->assertSame($governorate, $user->membership->governorate_id);
        $this->assertSame('Facebook group', $user->membership->referral_source);
        $this->assertDatabaseHas('audit_logs', ['action' => 'members.profile_updated', 'entity_id' => $member->membership->id, 'actor_id' => $member->id]);
    }

    public function test_member_cannot_take_a_mobile_number_used_by_someone_else(): void
    {
        $this->makeMember(['mobile' => '01112223334']);
        $this->actingAsMember();

        $this->patch(route('member.profile.update'), ['mobile' => '01112223334', 'preferred_locale' => 'ar'])->assertSessionHasErrors('mobile');
    }

    public function test_profile_input_cannot_touch_protected_fields(): void
    {
        $member = $this->actingAsMember(['name' => 'Real Name', 'email' => 'real@example.com']);

        $this->patch(route('member.profile.update'), [
            'mobile' => '01099990000',
            'preferred_locale' => 'ar',
            'name' => 'Hacker',
            'email' => 'hacker@example.com',
            'status' => 'active',
            'member_number' => 'EV-999999',
        ])->assertSessionHasNoErrors();

        $user = $member->fresh();
        $this->assertSame('Real Name', $user->name);
        $this->assertSame('real@example.com', $user->email);
        $this->assertSame($member->membership->member_number, $user->membership->member_number);
    }

    public function test_pending_members_see_the_status_page_but_can_complete_their_profile(): void
    {
        $this->actingAsMember([], ['status' => MembershipStatus::Pending]);

        $this->get(route('member.dashboard'))->assertRedirect(route('member.status'));
        $this->get(route('member.membership-card'))->assertRedirect(route('member.status'));
        $this->get(route('member.status'))->assertOk()->assertInertia(fn ($page) => $page->component('member/status'));
        $this->get(route('member.profile.edit'))->assertOk();
    }

    public function test_active_members_are_sent_from_the_status_page_to_the_dashboard(): void
    {
        $this->actingAsMember();

        $this->get(route('member.status'))->assertRedirect(route('member.dashboard'));
    }

    public function test_expired_members_cannot_open_the_card_or_regenerate_it(): void
    {
        $member = $this->actingAsMember();
        DB::table('memberships')->where('id', $member->membership->id)->update(['status' => MembershipStatus::Expired->value]);
        $member->unsetRelation('membership');
        $token = $member->membership->verification_token;

        $this->get(route('member.membership-card'))->assertRedirect(route('member.status'));
        $this->post(route('member.membership-card.rotate'))->assertRedirect(route('member.status'));
        $this->assertSame($token, $member->membership->fresh()->verification_token);
    }
}
