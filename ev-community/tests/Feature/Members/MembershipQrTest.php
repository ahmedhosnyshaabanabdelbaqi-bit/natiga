<?php

namespace Tests\Feature\Members;

use App\Models\User;
use App\Modules\Members\Actions\ChangeMembershipStatus;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Membership;
use App\Modules\Members\Models\MembershipVerification;
use App\Modules\Members\Services\MembershipQr;
use App\Modules\System\Services\Settings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MembershipQrTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Settings::flush(); // the settings service memoises values in a static between tests
    }

    private function qr(): MembershipQr
    {
        return app(MembershipQr::class);
    }

    private function decode(string $token): string
    {
        return (string) base64_decode(strtr($token, '-_', '+/').str_repeat('=', (4 - strlen($token) % 4) % 4));
    }

    private function encode(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    public function test_token_format_is_signed_public_id_and_expiry_without_personal_data(): void
    {
        Settings::set('members.qr_token_ttl_minutes', 5);
        $member = $this->makeMember(['name' => 'Samir Fathy', 'email' => 'samir@example.com']);
        $membership = $member->membership;

        $token = $this->qr()->token($membership);
        [$publicId, $expires, $hmac] = explode('.', $this->decode($token));

        $this->assertSame($membership->public_id, $publicId);
        $this->assertEqualsWithDelta(now()->addMinutes(5)->getTimestamp(), (int) $expires, 2);
        $key = base64_decode(substr((string) config('app.key'), 7));
        $this->assertSame(hash_hmac('sha256', $membership->verification_token.'|'.$expires, $key), $hmac);
        $this->assertStringNotContainsString('Samir', $this->decode($token));
        $this->assertStringNotContainsString($membership->member_number, $this->decode($token));
        $this->assertMatchesRegularExpression('/^[A-Za-z0-9_-]+$/', $token);
    }

    public function test_valid_token_verifies(): void
    {
        $member = $this->makeMember();
        $outcome = $this->qr()->verify($this->qr()->token($member->membership));

        $this->assertTrue($outcome['valid']);
        $this->assertTrue($outcome['authentic']);
        $this->assertTrue($outcome['membership']->is($member->membership));
    }

    public function test_expired_token_is_reported_as_expired(): void
    {
        $member = $this->makeMember();
        $token = $this->qr()->token($member->membership, now()->subSecond()->getTimestamp());

        $outcome = $this->qr()->verify($token);
        $this->assertFalse($outcome['valid']);
        $this->assertSame('expired', $outcome['reason']);

        $this->travel(11)->minutes();
        $this->assertSame('expired', $this->qr()->verify($this->qr()->token($member->membership, now()->subMinute()->getTimestamp()))['reason']);
    }

    public function test_tampered_tokens_are_invalid(): void
    {
        $member = $this->makeMember();
        $other = $this->makeMember();
        $token = $this->qr()->token($member->membership);
        [$publicId, $expires, $hmac] = explode('.', $this->decode($token));

        // Extended expiry, swapped member, forged signature, garbage.
        $this->assertSame('invalid', $this->qr()->verify($this->encode("{$publicId}.".($expires + 3600).".{$hmac}"))['reason']);
        $this->assertSame('invalid', $this->qr()->verify($this->encode("{$other->membership->public_id}.{$expires}.{$hmac}"))['reason']);
        $this->assertSame('invalid', $this->qr()->verify($this->encode("{$publicId}.{$expires}.".str_repeat('a', 64)))['reason']);
        $this->assertSame('invalid', $this->qr()->verify('not-a-token-at-all-xxxxxxxx')['reason']);
        $this->assertSame('invalid', $this->qr()->verify($this->encode('01ARZ3NDEKTSV4RRFFQ69G5FAV.123.'.str_repeat('b', 64)))['reason']);
        $this->assertFalse($this->qr()->verify($this->encode("{$publicId}.{$expires}.".str_repeat('a', 64)))['authentic']);
    }

    public function test_rotating_the_verification_token_invalidates_older_codes(): void
    {
        $member = $this->makeMember();
        $old = $this->qr()->token($member->membership);

        $member->membership->rotateVerificationToken();

        $this->assertSame('invalid', $this->qr()->verify($old)['reason']);
        $this->assertTrue($this->qr()->verify($this->qr()->token($member->membership->fresh()))['valid']);
    }

    public function test_suspended_membership_and_disabled_account_do_not_verify(): void
    {
        $member = $this->makeMember();
        $token = $this->qr()->token($member->membership);
        app(ChangeMembershipStatus::class)->execute($member->membership, MembershipStatus::Suspended, null, 'Chargeback investigation');

        $outcome = $this->qr()->verify($token);
        $this->assertFalse($outcome['valid']);
        $this->assertSame('not_active', $outcome['reason']);
        $this->assertTrue($outcome['authentic']);

        $disabled = $this->makeMember();
        $disabled->forceFill(['status' => User::STATUS_DISABLED])->save();
        $this->assertSame('not_active', $this->qr()->verify($this->qr()->token($disabled->membership))['reason']);
    }

    public function test_admin_verify_endpoint_logs_the_attempt_with_the_whitelisted_purpose(): void
    {
        $member = $this->makeMember();
        $staff = $this->actingAsStaff(['members.verify', 'members.view']);
        $token = $this->qr()->token($member->membership);

        $this->postJson(route('admin.members.verify'), ['token' => $this->qr()->verifyUrl($token), 'purpose' => 'pickup'])
            ->assertOk()
            ->assertJsonPath('data.valid', true)
            ->assertJsonPath('data.member.member_number', $member->membership->member_number)
            ->assertJsonPath('data.member.url', route('admin.members.show', $member->membership, false));

        $this->assertDatabaseHas('membership_verifications', ['membership_id' => $member->membership->id, 'verified_by' => $staff->id, 'purpose' => 'pickup', 'result' => 'valid']);

        $this->postJson(route('admin.members.verify'), ['token' => $token, 'purpose' => 'public'])->assertStatus(422)->assertJsonValidationErrors('purpose');
        $this->postJson(route('admin.members.verify'), ['token' => 'short'])->assertStatus(422)->assertJsonValidationErrors('token');
    }

    public function test_admin_payload_omits_the_member_link_without_members_view(): void
    {
        $member = $this->makeMember();
        $this->actingAsStaff(['members.verify']);

        $this->postJson(route('admin.members.verify'), ['token' => $this->qr()->token($member->membership)])
            ->assertOk()->assertJsonPath('data.member.url', null);
    }

    public function test_forged_token_for_a_real_member_reveals_nothing_but_is_logged(): void
    {
        $member = $this->makeMember(['name' => 'Hidden Person']);
        $staff = $this->actingAsStaff(['members.verify']);
        $forged = $this->encode($member->membership->public_id.'.'.now()->addMinutes(5)->getTimestamp().'.'.str_repeat('c', 64));

        $response = $this->postJson(route('admin.members.verify'), ['token' => $forged])->assertOk();
        $response->assertJsonPath('data.valid', false)->assertJsonPath('data.reason', 'invalid')->assertJsonPath('data.member', null);
        $this->assertStringNotContainsString('Hidden Person', $response->getContent());
        $this->assertDatabaseHas('membership_verifications', ['membership_id' => $member->membership->id, 'verified_by' => $staff->id, 'result' => 'invalid']);
    }

    public function test_partner_verify_payload_is_minimal(): void
    {
        $member = $this->makeMember(['name' => 'Mona Adel', 'email' => 'mona@example.com', 'mobile' => '01099887766']);
        $this->syncRbac();
        $partner = User::factory()->create();
        $partner->assignRole('service-center-admin');
        $this->actingAs($partner);

        $this->get(route('partner.members.scan'))->assertOk()->assertInertia(fn ($page) => $page->component('partner/members/scan')->has('purposes', 3));

        $response = $this->postJson(route('partner.members.verify'), ['token' => $this->qr()->token($member->membership), 'purpose' => 'offer'])->assertOk();
        $response->assertJsonPath('data.valid', true)
            ->assertJsonPath('data.member.name', 'Mona Adel')
            ->assertJsonPath('data.member.member_number', $member->membership->member_number)
            ->assertJsonPath('data.member.status', 'active');
        $this->assertSame(['name', 'member_number', 'status'], array_keys($response->json('data.member')));
        $this->assertSame(['valid', 'reason', 'member'], array_keys($response->json('data')));
        $body = $response->getContent();
        foreach (['mona@example.com', '01099887766', 'email', 'mobile', 'balance', 'amount', 'outstanding', 'governorate', 'expires_at'] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $body);
        }
        $this->assertDatabaseHas('membership_verifications', ['membership_id' => $member->membership->id, 'verified_by' => $partner->id, 'purpose' => 'offer']);

        // Partners may not log staff-only purposes.
        $this->postJson(route('partner.members.verify'), ['token' => $this->qr()->token($member->membership), 'purpose' => 'pickup'])->assertStatus(422);
    }

    public function test_public_verify_page_shows_only_the_result_and_a_masked_number(): void
    {
        $member = $this->makeMember(['name' => 'Public Person', 'email' => 'public@example.com']);
        $membership = $member->membership;
        $token = $this->qr()->token($membership);

        $response = $this->get(route('shared.members.verify', ['token' => $token]))->assertOk();
        $response->assertHeader('X-Robots-Tag', 'noindex, nofollow');
        $response->assertInertia(fn ($page) => $page->component('public/verify/show')
            ->where('result', 'valid')
            ->where('member_number_masked', Membership::maskMemberNumber($membership->member_number))
            ->missing('member_name')
            ->missing('member'));
        $this->assertStringNotContainsString('Public Person', $response->getContent());
        $this->assertStringNotContainsString($membership->member_number, $response->getContent());
        $this->assertMatchesRegularExpression('/^EV-\*+\d{2}$/', Membership::maskMemberNumber($membership->member_number));
        $this->assertDatabaseHas('membership_verifications', ['membership_id' => $membership->id, 'purpose' => 'public', 'verified_by' => null, 'result' => 'valid']);

        $expired = $this->qr()->token($membership, now()->subMinute()->getTimestamp());
        $this->get(route('shared.members.verify', ['token' => $expired]))->assertInertia(fn ($page) => $page->where('result', 'expired')->where('member_number_masked', null));
        $this->get(route('shared.members.verify', ['token' => str_repeat('x', 40)]))->assertInertia(fn ($page) => $page->where('result', 'invalid')->where('member_number_masked', null));
    }

    public function test_mask_helper(): void
    {
        $this->assertSame('EV-****23', Membership::maskMemberNumber('EV-000123'));
        $this->assertSame('EV-45', Membership::maskMemberNumber('EV-45')); // nothing left to hide
        $this->assertSame('****89', Membership::maskMemberNumber('123489'));
    }

    public function test_public_verify_is_rate_limited(): void
    {
        $token = str_repeat('y', 40);
        for ($i = 0; $i < 10; $i++) {
            $this->get(route('shared.members.verify', ['token' => $token]))->assertOk();
        }
        $this->get(route('shared.members.verify', ['token' => $token]))->assertStatus(429);
    }

    public function test_member_card_page_renders_a_fresh_qr_and_partial_reload_returns_only_qr(): void
    {
        $member = $this->actingAsMember();

        $first = $this->get(route('member.membership-card'));
        $first->assertOk()->assertInertia(fn ($page) => $page->component('member/membership-card/index')
            ->where('card.member_number', $member->membership->member_number)
            ->where('card.status', 'active')
            ->has('qr.svg')
            ->where('qr.token', fn ($token) => $this->qr()->verify($token)['valid'] === true)
            ->where('qr.ttl_minutes', 10));

        $this->get(route('member.membership-card'), [
            'X-Inertia' => 'true',
            'X-Inertia-Version' => (string) ($first->viewData('page')['version'] ?? ''),
            'X-Inertia-Partial-Component' => 'member/membership-card/index',
            'X-Inertia-Partial-Data' => 'qr',
        ])->assertOk()->assertJsonMissingPath('props.card')->assertJsonPath('props.qr.ttl_minutes', 10);
    }

    public function test_member_can_regenerate_own_qr_and_old_codes_stop_working(): void
    {
        $member = $this->actingAsMember();
        $old = $this->qr()->token($member->membership);

        $this->post(route('member.membership-card.rotate'))->assertRedirect();

        $this->assertSame('invalid', $this->qr()->verify($old)['reason']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'members.qr_token_rotated', 'entity_id' => $member->membership->id, 'actor_id' => $member->id]);
    }

    public function test_verifications_are_only_logged_for_resolvable_memberships(): void
    {
        $this->actingAsStaff(['members.verify']);
        $this->postJson(route('admin.members.verify'), ['token' => str_repeat('z', 40)])->assertOk()->assertJsonPath('data.reason', 'invalid');

        $this->assertSame(0, MembershipVerification::query()->count());
    }
}
