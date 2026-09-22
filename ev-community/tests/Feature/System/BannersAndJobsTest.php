<?php

namespace Tests\Feature\System;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\System\Models\StatusBanner;
use App\Modules\System\Services\SchedulerHeartbeat;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class BannersAndJobsTest extends TestCase
{
    use RefreshDatabase;

    public function test_banners_require_banners_manage(): void
    {
        $this->actingAsRole('accountant');
        $this->get('/admin/banners')->assertForbidden();
        $this->post('/admin/banners', ['level' => 'warning', 'message_ar' => 'صيانة', 'message_en' => 'Maintenance', 'targets' => ['public'], 'is_active' => true])->assertForbidden();
        $this->assertSame(0, StatusBanner::query()->count());
    }

    public function test_banner_crud_is_validated_and_audited(): void
    {
        $this->actingAsStaff(['banners.manage']);

        $this->post('/admin/banners', ['level' => 'critical', 'message_ar' => '', 'message_en' => 'x', 'targets' => ['admin'], 'is_active' => true])
            ->assertSessionHasErrors(['level', 'message_ar', 'targets.0']);

        // An end date without a start date is valid (shows immediately until the end).
        $this->post('/admin/banners', [
            'level' => 'warning', 'message_ar' => 'صيانة مجدولة الليلة', 'message_en' => 'Scheduled maintenance tonight',
            'targets' => ['public', 'member'], 'is_active' => true, 'starts_at' => '', 'ends_at' => now()->addDay()->format('Y-m-d\TH:i'),
        ])->assertRedirect()->assertSessionHasNoErrors();
        $banner = StatusBanner::query()->firstOrFail();
        $this->assertSame(['public', 'member'], $banner->targets);
        $this->assertTrue(AuditLog::query()->where('action', 'banners.created')->exists());

        $this->post('/admin/banners', [
            'level' => 'information', 'message_ar' => 'رسالة', 'message_en' => 'Message', 'targets' => ['partner'], 'is_active' => true,
            'starts_at' => now()->addDays(2)->format('Y-m-d\TH:i'), 'ends_at' => now()->addDay()->format('Y-m-d\TH:i'),
        ])->assertSessionHasErrors('ends_at');

        $this->put("/admin/banners/{$banner->id}", [
            'level' => 'major', 'message_ar' => 'عطل كبير', 'message_en' => 'Major outage', 'targets' => ['member'], 'is_active' => false,
        ])->assertRedirect()->assertSessionHasNoErrors();
        $this->assertSame('major', $banner->fresh()->level);
        $log = AuditLog::query()->where('action', 'banners.updated')->firstOrFail();
        $this->assertSame('warning', $log->old_values['level']);

        $this->get('/admin/banners')->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/banners/index')->has('banners.data', 1)->has('levels', 3));

        $this->delete("/admin/banners/{$banner->id}")->assertRedirect();
        $this->assertSame(0, StatusBanner::query()->count());
        $this->assertTrue(AuditLog::query()->where('action', 'banners.deleted')->exists());
    }

    public function test_active_banners_are_shared_with_their_target_portal_only(): void
    {
        StatusBanner::factory()->create(['message_en' => 'Members only notice', 'message_ar' => 'للأعضاء', 'targets' => ['member'], 'level' => 'warning']);
        StatusBanner::factory()->create(['message_en' => 'Expired notice', 'targets' => ['member'], 'ends_at' => now()->subHour()]);

        StatusBanner::factory()->create(['message_en' => 'Partners only', 'targets' => ['partner']]);

        // /settings/sessions is shared by every portal; for a member the "member" space banners are shared.
        $this->actingAsMember(['preferred_locale' => 'en']);
        $this->get('/settings/sessions')->assertOk()->assertInertia(fn (Assert $page) => $page->has('banners', 1)->where('banners.0.level', 'warning'));
    }

    private function failedJob(string $exception = 'RuntimeException: SMTP connection refused', string $queue = 'default'): string
    {
        $uuid = (string) Str::uuid();
        DB::table('failed_jobs')->insert([
            'uuid' => $uuid,
            'connection' => 'database',
            'queue' => $queue,
            'payload' => json_encode(['uuid' => $uuid, 'displayName' => 'App\\Jobs\\SendReceiptPdf', 'job' => 'Illuminate\\Queue\\CallQueuedHandler@call', 'attempts' => 3, 'maxTries' => 3, 'data' => ['commandName' => 'stdClass', 'command' => serialize((object) ['token' => 'secret-serialized-payload'])]]),
            'exception' => $exception."\n#0 /var/www/app/Secret/Path.php(12): password=hunter2\n#1 {main}",
            'failed_at' => now(),
        ]);

        return $uuid;
    }

    public function test_failed_jobs_require_jobs_manage(): void
    {
        $uuid = $this->failedJob();
        $this->actingAsRole('support-agent');
        $this->get('/admin/jobs/failed')->assertForbidden();
        $this->post("/admin/jobs/failed/{$uuid}/retry")->assertForbidden();
        $this->delete("/admin/jobs/failed/{$uuid}")->assertForbidden();
    }

    public function test_failed_jobs_list_shows_only_safe_fields_and_queue_health(): void
    {
        $this->actingAsStaff(['jobs.manage']);
        $this->failedJob(str_repeat('A', 500));
        DB::table('jobs')->insert(['queue' => 'notifications', 'payload' => '{}', 'attempts' => 0, 'reserved_at' => null, 'available_at' => now()->getTimestamp(), 'created_at' => now()->getTimestamp()]);
        SchedulerHeartbeat::beat();

        $response = $this->get('/admin/jobs/failed')->assertOk();
        $this->assertStringNotContainsString('hunter2', $response->getContent());
        $this->assertStringNotContainsString('secret-serialized-payload', $response->getContent());
        $response->assertInertia(fn (Assert $page) => $page->component('admin/jobs/failed')
            ->has('jobs.data', 1)
            ->where('jobs.data.0.job', 'App\\Jobs\\SendReceiptPdf')
            ->where('jobs.data.0.exception', fn ($text) => mb_strlen($text) <= 303)
            ->where('health.failed', 1)
            ->where('health.pending', [['queue' => 'notifications', 'count' => 1]])
            ->where('health.heartbeat.stale', false));
    }

    public function test_retry_pushes_the_job_back_and_delete_removes_it_both_audited(): void
    {
        $this->actingAsStaff(['jobs.manage']);
        $retry = $this->failedJob();
        $delete = $this->failedJob();

        $this->post("/admin/jobs/failed/{$retry}/retry")->assertRedirect()->assertSessionHas('success');
        $this->assertFalse(DB::table('failed_jobs')->where('uuid', $retry)->exists());
        $this->assertSame(1, DB::table('jobs')->count());
        $this->assertTrue(AuditLog::query()->where('action', 'jobs.retried')->where('entity_label', $retry)->exists());

        $this->delete("/admin/jobs/failed/{$delete}")->assertRedirect();
        $this->assertFalse(DB::table('failed_jobs')->where('uuid', $delete)->exists());
        $this->assertTrue(AuditLog::query()->where('action', 'jobs.deleted')->where('entity_label', $delete)->exists());

        $this->post('/admin/jobs/failed/'.Str::uuid().'/retry')->assertNotFound();

        // A payload that cannot be restored is reported instead of crashing, and the failed job is kept.
        $broken = $this->failedJob();
        DB::table('failed_jobs')->where('uuid', $broken)->update(['payload' => json_encode(['displayName' => 'Broken', 'data' => ['command' => 'not-serialized']])]);
        $this->post("/admin/jobs/failed/{$broken}/retry")->assertRedirect()->assertSessionHas('error');
        $this->assertTrue(DB::table('failed_jobs')->where('uuid', $broken)->exists());
    }

    public function test_stale_scheduler_heartbeat_is_reported(): void
    {
        $this->actingAsStaff(['jobs.manage']);
        cache()->put(SchedulerHeartbeat::CACHE_KEY, now()->subMinutes(10)->toIso8601String());

        $this->get('/admin/jobs/failed')->assertInertia(fn (Assert $page) => $page->where('health.heartbeat.stale', true));
        $this->assertTrue(SchedulerHeartbeat::isStale());
    }
}
