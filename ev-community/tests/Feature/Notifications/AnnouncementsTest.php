<?php

namespace Tests\Feature\Notifications;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Notifications\Jobs\SendAnnouncementJob;
use App\Modules\Notifications\Models\AnnouncementCampaign;
use App\Modules\Notifications\Models\AnnouncementRecipient;
use App\Modules\Notifications\Models\Enums\CampaignStatus;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Services\AnnouncementAudiences;
use App\Modules\Notifications\Services\AnnouncementService;
use App\Modules\Notifications\Services\NotificationPreferences;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Feature\Notifications\Support\InteractsWithNotifications;
use Tests\TestCase;

class AnnouncementsTest extends TestCase
{
    use InteractsWithNotifications;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpNotifications();
    }

    /** @return array<string, mixed> */
    private function payload(array $overrides = []): array
    {
        return array_replace([
            'title_ar' => 'إعلان مهم',
            'title_en' => 'Important announcement',
            'body_ar' => 'نص الإعلان',
            'body_en' => 'Announcement body',
            'url' => '/account',
            'category' => 'system',
            'is_marketing' => false,
            'channels' => ['in_app'],
            'audience_type' => AnnouncementAudiences::ALL_MEMBERS,
            'audience_params' => [],
        ], $overrides);
    }

    public function test_permissions_are_enforced(): void
    {
        $campaign = AnnouncementCampaign::factory()->create();

        $this->actingAsStaff([]);
        $this->get('/admin/notifications')->assertForbidden();
        $this->get("/admin/notifications/{$campaign->public_id}")->assertForbidden();

        $this->actingAsStaff(['notifications.view']);
        $this->get('/admin/notifications')->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/notifications/index')->where('canManage', false)->has('campaigns.data', 1));
        $this->get("/admin/notifications/{$campaign->public_id}")->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/notifications/show')->where('canManage', false));
        $this->get('/admin/notifications/create')->assertForbidden();
        $this->post('/admin/notifications', $this->payload())->assertForbidden();
        $this->post("/admin/notifications/{$campaign->public_id}/send")->assertForbidden();
        $this->post("/admin/notifications/{$campaign->public_id}/cancel")->assertForbidden();
        $this->delete("/admin/notifications/{$campaign->public_id}")->assertForbidden();
        $this->postJson('/admin/notifications/estimate', ['audience_type' => 'all_members'])->assertForbidden();

        $this->actingAsMember();
        $this->get('/admin/notifications')->assertForbidden();
    }

    public function test_default_roles_hold_the_expected_permissions(): void
    {
        $this->actingAsRole('content-manager');
        $this->get('/admin/notifications/create')->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/notifications/create')->has('audiences')->has('channels', 4)->has('categories', 10));

        $this->actingAsRole('support-agent');
        $this->get('/admin/notifications')->assertOk();
        $this->get('/admin/notifications/create')->assertForbidden();

        $this->actingAsRole('accountant');
        $this->get('/admin/notifications')->assertForbidden();
    }

    public function test_create_update_and_delete_a_draft_with_audit(): void
    {
        $staff = $this->actingAsStaff(['notifications.manage']);

        $this->post('/admin/notifications', $this->payload())->assertRedirect();
        $campaign = AnnouncementCampaign::query()->firstOrFail();
        $this->assertSame(CampaignStatus::Draft, $campaign->status);
        $this->assertSame(['in_app'], $campaign->channels);
        $this->assertSame($staff->id, $campaign->created_by);
        $this->assertTrue(AuditLog::query()->where('action', 'notifications.campaign_created')->exists());

        $this->get("/admin/notifications/{$campaign->public_id}/edit")->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/notifications/edit')->where('campaign.id', $campaign->public_id));

        $this->put("/admin/notifications/{$campaign->public_id}", $this->payload(['title_en' => 'Updated title']))->assertRedirect();
        $this->assertSame('Updated title', $campaign->fresh()->title_en);
        $this->assertTrue(AuditLog::query()->where('action', 'notifications.campaign_updated')->exists());

        $this->delete("/admin/notifications/{$campaign->public_id}")->assertRedirect('/admin/notifications');
        $this->assertModelMissing($campaign);
        $this->assertTrue(AuditLog::query()->where('action', 'notifications.campaign_deleted')->exists());
    }

    public function test_validation_rejects_bad_links_unconfigured_channels_and_unknown_audiences(): void
    {
        $this->actingAsStaff(['notifications.manage']);

        $this->post('/admin/notifications', $this->payload(['url' => 'javascript:alert(1)']))->assertSessionHasErrors('url');
        $this->post('/admin/notifications', $this->payload(['url' => '//evil.example']))->assertSessionHasErrors('url');
        $this->post('/admin/notifications', $this->payload(['channels' => ['in_app', 'sms']]))->assertSessionHasErrors('channels');
        $this->post('/admin/notifications', $this->payload(['audience_type' => 'everyone']))->assertSessionHasErrors('audience_type');
        $this->post('/admin/notifications', $this->payload(['title_ar' => '']))->assertSessionHasErrors('title_ar');
        $this->post('/admin/notifications', $this->payload(['audience_type' => 'vehicle_make', 'audience_params' => ['make_id' => 999999]]))->assertSessionHasErrors('audience_params.make_id');
        $this->assertSame(0, AnnouncementCampaign::query()->count());

        $this->emailConfigured();
        $this->post('/admin/notifications', $this->payload(['channels' => ['email']]))->assertSessionHasNoErrors();
        $this->assertSame(['in_app', 'email'], AnnouncementCampaign::query()->firstOrFail()->channels);
    }

    public function test_all_members_audience_counts_active_members_only(): void
    {
        $this->actingAsStaff(['notifications.manage']);
        $this->makeMember();
        $this->makeMember();
        $this->makeMember([], ['status' => 'suspended']);
        $this->makeMember([], ['status' => 'pending']);
        $this->makeMember(['status' => User::STATUS_DISABLED]);
        User::factory()->create(); // no membership

        $this->postJson('/admin/notifications/estimate', ['audience_type' => 'all_members'])
            ->assertOk()->assertJsonPath('data.count', 2);
        $this->assertSame(2, app(AnnouncementService::class)->estimate('all_members', []));
    }

    public function test_specific_members_are_resolved_by_member_number_on_the_server(): void
    {
        $this->actingAsStaff(['notifications.manage']);
        $a = $this->makeMember();
        $b = $this->makeMember();
        $suspended = $this->makeMember([], ['status' => 'suspended']);
        $numbers = strtolower($a->membership->member_number)."\n".$b->membership->member_number.", ".$b->membership->member_number;

        $this->postJson('/admin/notifications/estimate', ['audience_type' => 'specific_members', 'audience_params' => ['member_numbers' => $numbers]])
            ->assertOk()->assertJsonPath('data.count', 2);

        $this->postJson('/admin/notifications/estimate', ['audience_type' => 'specific_members', 'audience_params' => ['member_numbers' => 'EV-999999']])
            ->assertStatus(422)->assertJsonValidationErrors('audience_params.member_numbers');
        $this->postJson('/admin/notifications/estimate', ['audience_type' => 'specific_members', 'audience_params' => ['member_numbers' => $suspended->membership->member_number]])
            ->assertStatus(422);

        $this->post('/admin/notifications', $this->payload(['audience_type' => 'specific_members', 'audience_params' => ['member_numbers' => $numbers]]))->assertSessionHasNoErrors();
        $campaign = AnnouncementCampaign::query()->firstOrFail();
        $this->assertEqualsCanonicalizing([$a->membership->member_number, $b->membership->member_number], $campaign->audience_params['member_numbers']);
    }

    public function test_vehicle_make_audience_targets_owners_of_active_vehicles(): void
    {
        $this->actingAsStaff(['notifications.manage']);
        $makeId = DB::table('vehicle_makes')->insertGetId(['slug' => 'byd', 'name_ar' => 'بي واي دي', 'name_en' => 'BYD', 'is_active' => true, 'sort_order' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $modelId = DB::table('vehicle_models')->insertGetId(['vehicle_make_id' => $makeId, 'slug' => 'atto-3', 'name_ar' => 'أتو 3', 'name_en' => 'Atto 3', 'is_active' => true, 'sort_order' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $owner = $this->makeMember();
        $seller = $this->makeMember();
        $this->makeMember();
        foreach ([[$owner, 'active'], [$seller, 'sold']] as [$user, $status]) {
            DB::table('member_vehicles')->insert(['public_id' => (string) str()->ulid(), 'user_id' => $user->id, 'membership_id' => $user->membership->id, 'vehicle_make_id' => $makeId, 'vehicle_model_id' => $modelId, 'year' => 2024, 'status' => $status, 'created_at' => now(), 'updated_at' => now()]);
        }

        $this->postJson('/admin/notifications/estimate', ['audience_type' => 'vehicle_make', 'audience_params' => ['make_id' => $makeId]])->assertJsonPath('data.count', 1);
        $this->postJson('/admin/notifications/estimate', ['audience_type' => 'vehicle_model', 'audience_params' => ['model_id' => $modelId]])->assertJsonPath('data.count', 1);
    }

    public function test_send_now_queues_the_job_once_and_audits(): void
    {
        Queue::fake();
        $staff = $this->actingAsStaff(['notifications.manage']);
        $this->makeMember();
        $campaign = AnnouncementCampaign::factory()->create(['created_by' => $staff->id]);

        $this->post("/admin/notifications/{$campaign->public_id}/send")->assertRedirect()->assertSessionHasNoErrors();
        $this->assertSame(CampaignStatus::Sending, $campaign->fresh()->status);
        Queue::assertPushed(SendAnnouncementJob::class, fn (SendAnnouncementJob $job) => $job->campaignId === $campaign->id);
        $this->assertTrue(AuditLog::query()->where('action', 'notifications.campaign_sent')->where('actor_id', $staff->id)->exists());

        // A double click cannot send twice.
        $this->post("/admin/notifications/{$campaign->public_id}/send")->assertSessionHasErrors('domain');
        Queue::assertPushed(SendAnnouncementJob::class, 1);
    }

    public function test_sending_to_an_empty_audience_is_refused(): void
    {
        Queue::fake();
        $this->actingAsStaff(['notifications.manage']);
        $campaign = AnnouncementCampaign::factory()->create();

        $this->post("/admin/notifications/{$campaign->public_id}/send")->assertSessionHasErrors('audience_type');
        $this->assertSame(CampaignStatus::Draft, $campaign->fresh()->status);
        Queue::assertNothingPushed();
    }

    public function test_job_delivers_to_active_members_and_rerun_is_idempotent(): void
    {
        Queue::fake();
        $a = $this->makeMember();
        $b = $this->makeMember(['preferred_locale' => 'en']);
        $this->makeMember([], ['status' => 'suspended']);
        $campaign = AnnouncementCampaign::factory()->create(['status' => CampaignStatus::Sending, 'url' => '/account/offers', 'title_en' => 'Hello EN', 'title_ar' => 'مرحبا']);

        (new SendAnnouncementJob($campaign->id))->handle(app(AnnouncementService::class));

        $campaign->refresh();
        $this->assertSame(CampaignStatus::Sent, $campaign->status);
        $this->assertSame(2, $campaign->recipients_count);
        $this->assertSame(2, $campaign->sent_count);
        $this->assertSame(2, Notification::query()->where('dedup_key', 'announcement:'.$campaign->id)->count());
        $this->assertSame('Hello EN', Notification::query()->where('user_id', $b->id)->value('title'));
        $this->assertSame('مرحبا', Notification::query()->where('user_id', $a->id)->value('title'));
        $this->assertSame('/account/offers', Notification::query()->where('user_id', $a->id)->value('url'));

        // Re-running (duplicate job, admin retry after a crash) never duplicates notifications or recipients.
        $campaign->forceFill(['status' => CampaignStatus::Sending])->save();
        (new SendAnnouncementJob($campaign->id))->handle(app(AnnouncementService::class));
        app(AnnouncementService::class)->run($campaign->id);

        $this->assertSame(2, Notification::query()->where('dedup_key', 'announcement:'.$campaign->id)->count());
        $this->assertSame(2, AnnouncementRecipient::query()->where('campaign_id', $campaign->id)->count());
        $this->assertSame(2, $campaign->fresh()->sent_count);
    }

    public function test_marketing_announcement_respects_in_app_opt_out(): void
    {
        Queue::fake();
        $optedOut = $this->makeMember();
        $this->makeMember();
        NotificationPreferences::update($optedOut, ['marketing' => ['in_app' => false]]);
        $campaign = AnnouncementCampaign::factory()->marketing()->create(['status' => CampaignStatus::Sending]);

        app(AnnouncementService::class)->run($campaign->id);

        $campaign->refresh();
        $this->assertSame(2, $campaign->recipients_count);
        $this->assertSame(1, $campaign->sent_count);
        $this->assertSame('skipped', AnnouncementRecipient::query()->where('user_id', $optedOut->id)->first()->status->value);
        $this->assertSame(0, Notification::query()->where('user_id', $optedOut->id)->count());
    }

    public function test_cancelled_campaign_is_not_sent_by_a_late_job(): void
    {
        $this->makeMember();
        $campaign = AnnouncementCampaign::factory()->create(['status' => CampaignStatus::Cancelled]);

        $this->assertNull(app(AnnouncementService::class)->run($campaign->id));
        $this->assertSame(0, Notification::query()->count());
    }

    public function test_schedule_dispatch_and_cancel(): void
    {
        Queue::fake();
        $this->actingAsStaff(['notifications.manage']);
        $this->makeMember();
        $campaign = AnnouncementCampaign::factory()->create();

        $this->post("/admin/notifications/{$campaign->public_id}/schedule", ['scheduled_at' => now()->subHour()->format('Y-m-d\TH:i')])->assertSessionHasErrors('scheduled_at');
        $this->post("/admin/notifications/{$campaign->public_id}/schedule", ['scheduled_at' => now()->addHour()->format('Y-m-d\TH:i')])->assertSessionHasNoErrors();
        $this->assertSame(CampaignStatus::Scheduled, $campaign->fresh()->status);
        $this->assertTrue(AuditLog::query()->where('action', 'notifications.campaign_scheduled')->exists());

        // Not due yet.
        $this->artisan('notifications:dispatch-scheduled')->assertSuccessful();
        Queue::assertNothingPushed();

        $this->travel(2)->hours();
        $this->artisan('notifications:dispatch-scheduled')->assertSuccessful();
        $this->artisan('notifications:dispatch-scheduled')->assertSuccessful();
        Queue::assertPushed(SendAnnouncementJob::class, 1);
        $this->assertSame(CampaignStatus::Sending, $campaign->fresh()->status);
        $this->travelBack();

        $other = AnnouncementCampaign::factory()->scheduled(now()->addDay())->create();
        $this->post("/admin/notifications/{$other->public_id}/cancel", ['reason' => 'Plans changed'])->assertSessionHasNoErrors();
        $this->assertSame(CampaignStatus::Cancelled, $other->fresh()->status);
        $this->assertSame('Plans changed', AuditLog::query()->where('action', 'notifications.campaign_cancelled')->value('reason'));
        $this->post("/admin/notifications/{$other->public_id}/cancel")->assertSessionHasErrors('domain');
        $this->post("/admin/notifications/{$campaign->public_id}/cancel")->assertSessionHasErrors('domain'); // already sending
    }

    public function test_stale_sending_campaign_is_resumed_by_the_scheduler(): void
    {
        Queue::fake();
        $campaign = AnnouncementCampaign::factory()->create(['status' => CampaignStatus::Sending]);
        AnnouncementCampaign::query()->whereKey($campaign->id)->update(['updated_at' => now()->subHours(3)]);

        $this->artisan('notifications:dispatch-scheduled')->assertSuccessful();

        Queue::assertPushed(SendAnnouncementJob::class, 1);
        $this->assertTrue(AuditLog::query()->where('action', 'notifications.campaign_resumed')->exists());
    }

    public function test_sent_campaigns_cannot_be_edited_or_deleted(): void
    {
        $this->actingAsStaff(['notifications.manage']);
        $campaign = AnnouncementCampaign::factory()->create(['status' => CampaignStatus::Sent]);

        $this->put("/admin/notifications/{$campaign->public_id}", $this->payload())->assertSessionHasErrors('domain');
        $this->delete("/admin/notifications/{$campaign->public_id}")->assertSessionHasErrors('domain');
        $this->get("/admin/notifications/{$campaign->public_id}/edit")->assertRedirect("/admin/notifications/{$campaign->public_id}");
        $this->assertModelExists($campaign);
    }

    public function test_show_page_contains_counters_and_failures(): void
    {
        $this->actingAsStaff(['notifications.view']);
        $member = $this->makeMember();
        $campaign = AnnouncementCampaign::factory()->create(['status' => CampaignStatus::Failed, 'recipients_count' => 1, 'failed_count' => 1]);
        AnnouncementRecipient::query()->create(['campaign_id' => $campaign->id, 'user_id' => $member->id, 'status' => 'failed', 'error' => 'boom', 'created_at' => now()]);

        $this->get("/admin/notifications/{$campaign->public_id}")
            ->assertInertia(fn (Assert $page) => $page->where('campaign.status', 'failed')->where('campaign.can.retry', true)
                ->where('stats.by_status.failed', 1)
                ->where('stats.failures.0.member_number', $member->membership->member_number));
    }

    public function test_preview_renders_both_locales_and_escapes_html(): void
    {
        $this->actingAsStaff(['notifications.manage']);

        $this->postJson('/admin/notifications/preview', ['title_ar' => 'عنوان', 'title_en' => 'Title', 'body_ar' => 'نص', 'body_en' => '<script>alert(1)</script> **bold**', 'url' => '/account'])
            ->assertOk()
            ->assertJsonPath('data.ar.title', 'عنوان')
            ->assertJsonPath('data.en.title', 'Title')
            ->assertJsonPath('data.en.email_subject', 'Title')
            ->assertJson(fn ($json) => $json->where('data.en.email_html', fn (string $html) => str_contains($html, '&lt;script&gt;') && ! str_contains($html, '<script>'))->etc());
    }

    public function test_list_filters_by_status_and_search(): void
    {
        $this->actingAsStaff(['notifications.view']);
        AnnouncementCampaign::factory()->create(['title_en' => 'Summer offer']);
        AnnouncementCampaign::factory()->create(['title_en' => 'Winter news', 'status' => CampaignStatus::Sent]);

        $this->get('/admin/notifications?status=sent')->assertInertia(fn (Assert $page) => $page->has('campaigns.data', 1)->where('campaigns.data.0.title_en', 'Winter news')->where('counts.sent', 1)->where('counts.draft', 1));
        $this->get('/admin/notifications?search=summer')->assertInertia(fn (Assert $page) => $page->has('campaigns.data', 1));
        $this->get('/admin/notifications?status=bogus')->assertSessionHasErrors('status');
    }
}
