<?php

namespace Tests\Feature\Operations;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Audit\Models\SecurityEvent;
use App\Modules\Reports\Operations\Models\Enums\ExceptionSeverity;
use App\Modules\Reports\Operations\Models\Enums\ExceptionStatus;
use App\Modules\Reports\Operations\Models\OperationsException;
use App\Modules\Reports\Operations\Services\OperationsExceptions;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use InvalidArgumentException;
use Tests\TestCase;

class ExceptionCenterTest extends TestCase
{
    use RefreshDatabase;

    private function ops(): OperationsExceptions
    {
        return app(OperationsExceptions::class);
    }

    public function test_raising_the_same_dedup_key_increments_occurrences_instead_of_duplicating(): void
    {
        $first = $this->ops()->raise('finance', 'p2', 'Unallocated payment PAY-2026-000012', ['payment' => 'PAY-2026-000012'], 'finance:unallocated:12', 'finance:reconcile');
        $second = $this->ops()->raise('finance', 'p1', 'Unallocated payment PAY-2026-000012', ['age_days' => 3], 'finance:unallocated:12', 'finance:reconcile');
        $third = $this->ops()->raise('finance', 'p3', 'Unallocated payment PAY-2026-000012', [], 'finance:unallocated:12', 'finance:reconcile');

        $this->assertSame($first->id, $second->id);
        $this->assertSame($first->id, $third->id);
        $this->assertSame(1, OperationsException::query()->count());
        $fresh = $first->fresh();
        $this->assertSame(3, $fresh->occurrences);
        $this->assertSame(ExceptionSeverity::P1, $fresh->severity, 'severity escalates but never de-escalates');
        $this->assertSame(['payment' => 'PAY-2026-000012', 'age_days' => 3], $fresh->details);
    }

    public function test_a_resolved_exception_is_reopened_as_a_new_row_when_it_recurs(): void
    {
        $actor = $this->makeStaff(['operations.manage']);
        $first = $this->ops()->raise('inventory', 'p2', 'Negative stock SKU-1', [], 'inventory:negative:1');
        $this->ops()->resolve($first, $actor, 'Recounted and adjusted');

        $again = $this->ops()->raise('inventory', 'p2', 'Negative stock SKU-1', [], 'inventory:negative:1');

        $this->assertNotSame($first->id, $again->id);
        $this->assertSame(ExceptionStatus::Resolved, $first->fresh()->status);
        $this->assertSame(1, $again->occurrences);
    }

    public function test_the_database_allows_only_one_live_exception_per_dedup_key(): void
    {
        $this->ops()->raise('orders', 'p2', 'Stuck order', [], 'orders:stuck:1');

        $this->expectException(UniqueConstraintViolationException::class);
        DB::transaction(fn () => OperationsException::query()->create([
            'category' => 'orders', 'severity' => 'p2', 'title' => 'Duplicate', 'dedup_key' => 'orders:stuck:1', 'status' => 'open', 'detected_at' => now(), 'occurrences' => 1,
        ]));
    }

    public function test_unknown_category_or_severity_is_rejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->ops()->raise('weather', 'p2', 'Rain');
    }

    public function test_p0_raises_a_critical_security_event_and_notifies_operations_managers(): void
    {
        $this->syncRbac();
        $manager = $this->makeStaff(['operations.manage']);
        $bystander = $this->makeStaff(['operations.view']);

        $exception = $this->ops()->raise('finance', 'p0', 'Ledger does not balance', ['difference' => '120.00'], 'finance:ledger', 'finance:reconcile');

        $event = SecurityEvent::query()->where('event_type', 'operations_p0_exception')->firstOrFail();
        $this->assertSame('critical', $event->severity);
        $this->assertSame($exception->public_id, $event->meta['exception']);

        if (class_exists(OperationsExceptions::NOTIFY_CLASS)) {
            $this->assertTrue(DB::table('notifications')->where('user_id', $manager->id)->where('key', OperationsExceptions::P0_NOTIFICATION)->exists());
            $this->assertFalse(DB::table('notifications')->where('user_id', $bystander->id)->exists());
        }

        // A recurrence does not alert again.
        $this->ops()->raise('finance', 'p0', 'Ledger does not balance', [], 'finance:ledger', 'finance:reconcile');
        $this->assertSame(1, SecurityEvent::query()->where('event_type', 'operations_p0_exception')->count());
    }

    public function test_viewers_see_the_center_but_only_managers_act(): void
    {
        $exception = OperationsException::factory()->create(['severity' => 'p1', 'category' => 'shipping']);

        $this->actingAsRole('delivery-officer');
        $this->get('/admin/operations')->assertForbidden();

        $this->actingAsStaff(['operations.view']);
        $this->get('/admin/operations')->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/operations/index')
            ->where('can.manage', false)
            ->has('exceptions.data', 1)
            ->where('counts.p1', 1)
            ->where('filters.status', 'live'));
        $this->post("/admin/operations/{$exception->public_id}/resolve", ['resolution' => 'Fixed it myself'])->assertForbidden();
        $this->post("/admin/operations/{$exception->public_id}/assign", [])->assertForbidden();
        $this->post("/admin/operations/{$exception->public_id}/ignore", ['reason' => 'Not important'])->assertForbidden();
        $this->assertSame(ExceptionStatus::Open, $exception->fresh()->status);
    }

    public function test_manager_assigns_resolves_and_ignores_with_reasons_and_audit(): void
    {
        $manager = $this->actingAsStaff(['operations.view', 'operations.manage']);
        $colleague = $this->makeStaff(['operations.manage']);
        $member = $this->makeMember();
        $first = OperationsException::factory()->create(['severity' => 'p2']);
        $second = OperationsException::factory()->create(['severity' => 'p3']);

        $this->post("/admin/operations/{$first->public_id}/assign", ['assignee' => $member->public_id])->assertSessionHasErrors('assignee');
        $this->post("/admin/operations/{$first->public_id}/assign", ['assignee' => $colleague->public_id, 'note' => 'Please check the bank file'])->assertRedirect()->assertSessionHasNoErrors();
        $first->refresh();
        $this->assertSame(ExceptionStatus::Assigned, $first->status);
        $this->assertSame($colleague->id, $first->assigned_to);

        $this->post("/admin/operations/{$first->public_id}/resolve", ['resolution' => 'ok'])->assertSessionHasErrors('resolution');
        $this->post("/admin/operations/{$first->public_id}/resolve", ['resolution' => 'Matched the payment to order ORD-2026-000044'])->assertRedirect()->assertSessionHasNoErrors();
        $first->refresh();
        $this->assertSame(ExceptionStatus::Resolved, $first->status);
        $this->assertSame($manager->id, $first->resolved_by);

        $this->post("/admin/operations/{$second->public_id}/ignore", [])->assertSessionHasErrors('reason');
        $this->post("/admin/operations/{$second->public_id}/ignore", ['reason' => 'Known test data, safe to ignore'])->assertRedirect()->assertSessionHasNoErrors();
        $this->assertSame(ExceptionStatus::Ignored, $second->fresh()->status);

        // Closed exceptions cannot be assigned or ignored again.
        $this->post("/admin/operations/{$first->public_id}/ignore", ['reason' => 'Ignore after resolve'])->assertSessionHasErrors();

        $actions = AuditLog::query()->pluck('action')->all();
        $this->assertContains('operations.exception_assigned', $actions);
        $this->assertContains('operations.exception_resolved', $actions);
        $this->assertContains('operations.exception_ignored', $actions);
        $this->assertSame('Known test data, safe to ignore', AuditLog::query()->where('action', 'operations.exception_ignored')->value('reason'));
    }

    public function test_filters_and_status_views(): void
    {
        $manager = $this->actingAsStaff(['operations.view', 'operations.manage']);
        OperationsException::factory()->create(['severity' => 'p0', 'category' => 'finance', 'title' => 'Ledger mismatch']);
        OperationsException::factory()->create(['severity' => 'p2', 'category' => 'inventory', 'assigned_to' => $manager->id, 'status' => 'assigned']);
        OperationsException::factory()->resolved()->create(['severity' => 'p1', 'category' => 'orders']);

        $this->get('/admin/operations')->assertInertia(fn (Assert $page) => $page->has('exceptions.data', 2)->where('exceptions.data.0.severity', 'p0'));
        $this->get('/admin/operations?status=all')->assertInertia(fn (Assert $page) => $page->has('exceptions.data', 3));
        $this->get('/admin/operations?status=resolved')->assertInertia(fn (Assert $page) => $page->has('exceptions.data', 1));
        $this->get('/admin/operations?assigned=me')->assertInertia(fn (Assert $page) => $page->has('exceptions.data', 1)->where('exceptions.data.0.category', 'inventory'));
        $this->get('/admin/operations?assigned=unassigned')->assertInertia(fn (Assert $page) => $page->has('exceptions.data', 1));
        $this->get('/admin/operations?category=finance&q=ledger')->assertInertia(fn (Assert $page) => $page->has('exceptions.data', 1));
    }

    public function test_resolve_by_key_auto_recovers_and_is_audited_as_system(): void
    {
        $this->ops()->raise('integrations', 'p1', 'SMS provider down', [], 'health:integrations.sms');

        $recovered = $this->ops()->resolveByKey('health:integrations.sms', 'auto-resolved: check passed');
        $this->assertNotNull($recovered);
        $this->assertSame(ExceptionStatus::Resolved, $recovered->status);
        $this->assertSame('system', AuditLog::query()->where('action', 'operations.exception_resolved')->value('actor_type'));
        $this->assertNull($this->ops()->resolveByKey('health:integrations.sms'));
    }
}
