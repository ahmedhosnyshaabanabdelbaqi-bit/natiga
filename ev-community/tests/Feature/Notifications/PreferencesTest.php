<?php

namespace Tests\Feature\Notifications;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Notifications\Models\Enums\NotificationChannel;
use App\Modules\Notifications\Models\NotificationPreference;
use App\Modules\Notifications\Services\MarketingConsent;
use App\Modules\Notifications\Services\NotificationPreferences;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Feature\Notifications\Support\InteractsWithNotifications;
use Tests\TestCase;

class PreferencesTest extends TestCase
{
    use InteractsWithNotifications;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpNotifications();
    }

    public function test_page_shows_the_category_channel_matrix_with_locked_transactional_pairs(): void
    {
        $this->actingAsMember();

        $this->get('/account/notification-preferences')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('member/notifications/preferences')
                ->has('matrix.channels', 4)
                ->has('matrix.categories', 11)
                ->where('matrix.categories.0.category', 'orders')
                ->where('matrix.categories.0.channels.in_app.locked', true)
                ->where('matrix.categories.0.channels.email.locked', true)
                ->where('matrix.categories.0.channels.sms.locked', false)
                ->where('matrix.categories.10.category', 'marketing')
                ->where('matrix.categories.10.channels.email.enabled', false)
                ->where('matrix.categories.10.channels.email.locked', false)
                ->where('matrix.channels.2.value', 'sms')
                ->where('matrix.channels.2.configured', false)
                ->where('matrix.channels.2.consent', false));
    }

    public function test_marketing_opt_in_records_consent_and_is_audited(): void
    {
        $member = $this->actingAsMember();

        $this->put('/account/notification-preferences', ['preferences' => ['marketing' => ['email' => true, 'in_app' => true], 'orders' => ['sms' => false]]])
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        $this->assertTrue(NotificationPreferences::allows($member, 'marketing', NotificationChannel::Email));
        $this->assertFalse(NotificationPreferences::allows($member, 'orders', NotificationChannel::Sms));
        $this->assertTrue(MarketingConsent::has($member, NotificationChannel::Email));
        $audit = AuditLog::query()->where('action', 'notifications.preferences_updated')->latest('id')->first();
        $this->assertNotNull($audit);
        $this->assertSame($member->id, $audit->actor_id);
        $this->assertTrue($audit->new_values['marketing.email']);
        $this->assertFalse($audit->new_values['orders.sms']);

        // Opting out withdraws the consent (append-only consent_logs).
        $this->putJson('/account/notification-preferences', ['preferences' => ['marketing' => ['email' => false]]])->assertOk();
        $this->assertFalse(MarketingConsent::has($member, NotificationChannel::Email));
        $this->assertSame(2, DB::table('consent_logs')->where('user_id', $member->id)->where('consent_type', 'marketing_email')->count());
    }

    public function test_transactional_in_app_and_email_cannot_be_disabled(): void
    {
        $member = $this->actingAsMember();

        $this->putJson('/account/notification-preferences', ['preferences' => ['orders' => ['in_app' => false]]])
            ->assertStatus(422)->assertJsonValidationErrors('preferences.orders.in_app');
        $this->putJson('/account/notification-preferences', ['preferences' => ['payments' => ['sms' => false, 'email' => false]]])
            ->assertStatus(422)->assertJsonValidationErrors('preferences.payments.email');

        // Nothing was half-applied.
        $this->assertSame(0, NotificationPreference::query()->where('user_id', $member->id)->count());
        $this->assertSame(0, AuditLog::query()->where('action', 'notifications.preferences_updated')->count());
    }

    public function test_sms_and_whatsapp_consent_switches(): void
    {
        $member = $this->actingAsMember();

        $this->putJson('/account/notification-preferences', ['consents' => ['sms' => true, 'whatsapp' => false]])->assertOk()
            ->assertJsonPath('data.matrix.channels.2.consent', true)
            ->assertJsonPath('data.matrix.channels.3.consent', false);
        $this->assertTrue(MarketingConsent::has($member, NotificationChannel::Sms));
        $this->assertFalse(MarketingConsent::has($member, NotificationChannel::WhatsApp));

        $this->putJson('/account/notification-preferences', ['consents' => ['sms' => false]])->assertOk();
        $this->assertFalse(MarketingConsent::has($member, NotificationChannel::Sms));
    }

    public function test_unknown_categories_and_channels_are_rejected(): void
    {
        $this->actingAsMember();

        $this->putJson('/account/notification-preferences', ['preferences' => ['secret' => ['email' => true]]])->assertStatus(422);
        $this->putJson('/account/notification-preferences', ['preferences' => ['orders' => ['pigeon' => true]]])->assertStatus(422);
        $this->putJson('/account/notification-preferences', ['preferences' => ['orders' => ['sms' => 'maybe']]])->assertStatus(422);
    }

    public function test_preferences_are_always_the_signed_in_members_own(): void
    {
        $victim = $this->makeMember();
        $attacker = $this->actingAsMember();

        $this->putJson('/account/notification-preferences', ['user_id' => $victim->id, 'preferences' => ['orders' => ['sms' => false]]])->assertOk();

        $this->assertSame(0, NotificationPreference::query()->where('user_id', $victim->id)->count());
        $this->assertSame(1, NotificationPreference::query()->where('user_id', $attacker->id)->count());
    }

    public function test_staff_without_membership_cannot_reach_member_preferences(): void
    {
        $this->actingAsStaff([]);

        $this->get('/account/notification-preferences')->assertRedirect();
    }
}
