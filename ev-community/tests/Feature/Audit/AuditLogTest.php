<?php

namespace Tests\Feature\Audit;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Audit\Models\SecurityEvent;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use LogicException;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use RefreshDatabase;

    private function seedLogs(User $actor): void
    {
        $audit = app(AuditService::class);
        $target = User::factory()->create(['name' => 'Target Person']);
        app()->instance('ev.request_id', 'REQ-ALPHA-0001');
        $audit->log('users.updated', $target, old: ['name' => 'Old'], new: ['name' => 'Target Person'], reason: 'Typo fix', actor: $actor);
        $audit->log('users.access_reset', $target, new: ['password' => 'hunter2', 'token' => 'abc123', 'sessions_revoked' => 2], reason: 'Lost phone', actor: $actor);
        app()->instance('ev.request_id', 'REQ-BETA-0002');
        $audit->log('settings.updated', null, old: ['branding.site_name_en' => 'A'], new: ['branding.site_name_en' => '=HYPERLINK("http://evil")'], reason: '=cmd|calc', actor: $actor, entityLabel: '+danger');
    }

    public function test_viewer_requires_audit_view(): void
    {
        $this->actingAsRole('support-agent');
        $this->get('/admin/audit-logs')->assertForbidden();
        $this->get('/admin/audit-logs/export')->assertForbidden();

        $log = app(AuditService::class)->log('test.action', null, new: ['a' => 1]);
        $this->getJson("/admin/audit-logs/{$log->id}")->assertForbidden();
    }

    public function test_list_supports_filters(): void
    {
        $actor = $this->actingAsStaff(['audit.view'], ['name' => 'Auditor Amal']);
        $this->seedLogs($actor);

        $this->get('/admin/audit-logs')->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/audit-logs/index')
            ->has('logs.data', 3)
            ->where('exportMax', 10000)
            ->where('actions', fn ($actions) => collect($actions)->contains('users.updated') && collect($actions)->contains('settings.updated')));

        $this->get('/admin/audit-logs?action=users.updated')->assertInertia(fn (Assert $page) => $page->has('logs.data', 1)->where('logs.data.0.action', 'users.updated'));
        $this->get('/admin/audit-logs?action=users.*')->assertInertia(fn (Assert $page) => $page->has('logs.data', 2));
        $this->get('/admin/audit-logs?request_id=REQ-BETA-0002')->assertInertia(fn (Assert $page) => $page->has('logs.data', 1)->where('logs.data.0.action', 'settings.updated'));
        $this->get('/admin/audit-logs?actor=Amal')->assertInertia(fn (Assert $page) => $page->has('logs.data', 3));
        $this->get('/admin/audit-logs?actor=nobody-matches')->assertInertia(fn (Assert $page) => $page->has('logs.data', 0));
        $this->get('/admin/audit-logs?entity_type='.urlencode((new User)->getMorphClass()))->assertInertia(fn (Assert $page) => $page->has('logs.data', 2));
        $this->get('/admin/audit-logs?from='.now()->addDay()->toDateString())->assertInertia(fn (Assert $page) => $page->has('logs.data', 0));
        $this->get('/admin/audit-logs?from='.now()->toDateString().'&to='.now()->toDateString())->assertInertia(fn (Assert $page) => $page->has('logs.data', 3));
    }

    public function test_detail_shows_the_diff_with_redacted_secrets(): void
    {
        $actor = $this->actingAsStaff(['audit.view']);
        $this->seedLogs($actor);
        $log = AuditLog::query()->where('action', 'users.access_reset')->firstOrFail();

        $this->getJson("/admin/audit-logs/{$log->id}")->assertOk()
            ->assertJsonPath('data.action', 'users.access_reset')
            ->assertJsonPath('data.reason', 'Lost phone')
            ->assertJsonPath('data.new_values.password', '[redacted]')
            ->assertJsonPath('data.new_values.token', '[redacted]')
            ->assertJsonPath('data.new_values.sessions_revoked', 2)
            ->assertJsonPath('data.request_id', 'REQ-ALPHA-0001')
            ->assertJsonMissing(['hunter2']);
    }

    public function test_csv_export_streams_the_filter_neutralises_formulas_and_is_itself_audited(): void
    {
        $actor = $this->actingAsStaff(['audit.view']);
        $this->seedLogs($actor);

        $response = $this->get('/admin/audit-logs/export?action=settings.updated')->assertOk();
        $this->assertStringContainsString('text/csv', (string) $response->headers->get('Content-Type'));
        $csv = $response->streamedContent();

        $lines = array_values(array_filter(explode("\n", trim($csv))));
        $this->assertCount(2, $lines, 'header + the single matching row');
        $this->assertStringContainsString("'=cmd|calc", $csv, 'a formula-looking reason is prefixed');
        $this->assertStringContainsString("'+danger", $csv);
        $this->assertStringNotContainsString(',=cmd', $csv);

        $export = AuditLog::query()->where('action', 'audit.exported')->firstOrFail();
        $this->assertSame($actor->id, $export->actor_id);
        $this->assertSame(1, $export->new_values['rows']);
        $this->assertSame(['action' => 'settings.updated'], $export->new_values['filters']);
    }

    public function test_csv_export_is_newest_first(): void
    {
        $actor = $this->actingAsStaff(['audit.view']);
        $this->seedLogs($actor);

        $csv = $this->get('/admin/audit-logs/export')->streamedContent();
        $lines = array_values(array_filter(explode("\n", trim($csv))));
        // Row 1 is the newest entry (the settings change); the export entry itself is written before streaming.
        $this->assertStringContainsString('audit.exported', $lines[1]);
        $this->assertStringContainsString('settings.updated', $lines[2]);
    }

    public function test_audit_rows_are_immutable_through_the_model_guard(): void
    {
        $log = app(AuditService::class)->log('test.immutable', null, new: ['value' => 1]);

        try {
            $log->update(['action' => 'tampered']);
            $this->fail('Updating an audit row must throw.');
        } catch (LogicException) {
        }
        try {
            $log->delete();
            $this->fail('Deleting an audit row must throw.');
        } catch (LogicException) {
        }
        $this->assertSame('test.immutable', $log->fresh()->action);
    }

    public function test_audit_rows_are_immutable_at_the_database_level(): void
    {
        $log = app(AuditService::class)->log('test.immutable', null, new: ['value' => 1]);

        try {
            DB::transaction(fn () => DB::table('audit_logs')->where('id', $log->id)->update(['action' => 'tampered']));
            $this->fail('The trigger must block UPDATE.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('immutable', $e->getMessage());
        }
        try {
            DB::transaction(fn () => DB::table('audit_logs')->where('id', $log->id)->delete());
            $this->fail('The trigger must block DELETE.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('immutable', $e->getMessage());
        }
        $this->assertSame('test.immutable', DB::table('audit_logs')->where('id', $log->id)->value('action'));
    }

    public function test_security_events_page_requires_permission_and_filters_critical_events(): void
    {
        $this->actingAsRole('accountant');
        $this->get('/admin/security-events')->assertForbidden();

        $victim = User::factory()->create(['name' => 'Victim Vera']);
        SecurityEvents::record($victim, 'login_failed', ['email' => 'vera@example.com'], 'warning');
        SecurityEvents::record($victim, 'account_disabled', ['by' => 1]);
        SecurityEvents::record(null, 'operations_p0_exception', ['title' => 'Ledger mismatch'], 'critical');

        $this->actingAsStaff(['security_events.view']);
        $this->get('/admin/security-events')->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/security-events/index')
            ->has('events.data', 3)
            ->where('criticalCount', 2)
            ->where('types', fn ($types) => collect($types)->contains('login_failed')));

        $this->get('/admin/security-events?critical=1')->assertInertia(fn (Assert $page) => $page->has('events.data', 2));
        $this->get('/admin/security-events?severity=warning')->assertInertia(fn (Assert $page) => $page->has('events.data', 1)->where('events.data.0.type', 'login_failed'));
        $this->get('/admin/security-events?user=Vera')->assertInertia(fn (Assert $page) => $page->has('events.data', 2));
        $this->get('/admin/security-events?type=account_disabled')->assertInertia(fn (Assert $page) => $page->has('events.data', 1)->where('events.data.0.user.id', $victim->public_id));
        $this->assertSame('critical', SecurityEvent::query()->where('event_type', 'account_disabled')->value('severity'));
    }
}
