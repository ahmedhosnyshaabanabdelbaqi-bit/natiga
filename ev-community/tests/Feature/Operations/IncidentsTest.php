<?php

namespace Tests\Feature\Operations;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Reports\Operations\Models\Enums\IncidentStatus;
use App\Modules\Reports\Operations\Models\Incident;
use App\Modules\Reports\Operations\Models\IncidentEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class IncidentsTest extends TestCase
{
    use RefreshDatabase;

    public function test_viewers_can_read_but_not_change_incidents(): void
    {
        $incident = Incident::factory()->create();

        $this->actingAsRole('delivery-officer');
        $this->get('/admin/incidents')->assertForbidden();
        $this->get("/admin/incidents/{$incident->public_id}")->assertForbidden();

        $this->actingAsStaff(['incidents.view']);
        $this->get('/admin/incidents')->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/incidents/index')->where('can.manage', false)->has('incidents.data', 1));
        $this->get("/admin/incidents/{$incident->public_id}")->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/incidents/show')->where('can.manage', false));
        $this->get('/admin/incidents/create')->assertForbidden();
        $this->post('/admin/incidents', ['title' => 'Checkout is down', 'severity' => 'p0'])->assertForbidden();
        $this->post("/admin/incidents/{$incident->public_id}/status", ['status' => 'investigating'])->assertForbidden();
        $this->post("/admin/incidents/{$incident->public_id}/notes", ['message' => 'Looking into it'])->assertForbidden();
        $this->put("/admin/incidents/{$incident->public_id}/review", ['root_cause' => 'x'])->assertForbidden();
        $this->assertSame(IncidentStatus::Open, $incident->fresh()->status);
    }

    public function test_declaring_an_incident_assigns_an_inc_number_timeline_and_audit(): void
    {
        $manager = $this->actingAsStaff(['incidents.view', 'incidents.manage']);

        $this->get('/admin/incidents/create')->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/incidents/create')->has('owners')->has('modules')->has('severities', 4));

        $this->post('/admin/incidents', ['title' => 'x', 'severity' => 'p9'])->assertSessionHasErrors(['title', 'severity']);

        $response = $this->post('/admin/incidents', [
            'title' => 'Payment approvals failing', 'severity' => 'p1', 'affected_module' => 'payments',
            'impact' => 'Receipts are not generated for approved payments', 'started_at' => now()->subHour()->format('Y-m-d\TH:i'), 'detected_at' => '',
        ]);

        $incident = Incident::query()->firstOrFail();
        $response->assertRedirect("/admin/incidents/{$incident->public_id}");
        $this->assertMatchesRegularExpression('/^INC-\d{4}-\d{4}$/', $incident->number);
        $this->assertSame($manager->id, $incident->owner_id, 'the declarer owns it by default');
        $this->assertSame(IncidentStatus::Open, $incident->status);
        $this->assertSame(['created'], IncidentEvent::query()->where('incident_id', $incident->id)->pluck('type')->all());
        $this->assertTrue(AuditLog::query()->where('action', 'incidents.created')->where('entity_id', $incident->id)->exists());

        $second = Incident::factory()->create();
        $this->assertNotSame($incident->number, $second->number);
    }

    public function test_owner_must_be_someone_who_can_manage_incidents(): void
    {
        $this->actingAsStaff(['incidents.view', 'incidents.manage']);
        $member = $this->makeMember();

        $this->post('/admin/incidents', ['title' => 'Sync outage for stations', 'severity' => 'p2', 'owner' => $member->public_id])->assertSessionHasErrors('owner');
        $this->assertSame(0, Incident::query()->count());
    }

    public function test_transitions_follow_the_lifecycle_are_audited_and_closing_requires_a_review(): void
    {
        $this->actingAsStaff(['incidents.view', 'incidents.manage']);
        $incident = Incident::factory()->create();

        $this->post("/admin/incidents/{$incident->public_id}/status", ['status' => 'closed'])->assertSessionHasErrors('status');

        $this->post("/admin/incidents/{$incident->public_id}/status", ['status' => 'investigating', 'note' => 'Checking gateway logs'])->assertRedirect()->assertSessionHasNoErrors();
        $this->post("/admin/incidents/{$incident->public_id}/status", ['status' => 'resolved'])->assertRedirect()->assertSessionHasNoErrors();
        $incident->refresh();
        $this->assertSame(IncidentStatus::Resolved, $incident->status);
        $this->assertNotNull($incident->resolved_at);

        // Closing without root cause / resolution is refused.
        $this->post("/admin/incidents/{$incident->public_id}/status", ['status' => 'closed'])->assertSessionHasErrors('status');

        $this->put("/admin/incidents/{$incident->public_id}/review", [
            'root_cause' => 'Expired gateway certificate', 'resolution' => 'Renewed certificate and replayed webhooks',
            'corrective_actions' => 'Certificate expiry monitoring', 'review' => ['what_went_well' => 'Fast detection', 'unknown_key' => 'dropped'],
        ])->assertRedirect()->assertSessionHasNoErrors();
        $incident->refresh();
        $this->assertSame(['what_went_well' => 'Fast detection'], $incident->review);

        $this->post("/admin/incidents/{$incident->public_id}/status", ['status' => 'closed'])->assertRedirect()->assertSessionHasNoErrors();
        $this->assertSame(IncidentStatus::Closed, $incident->fresh()->status);

        $types = IncidentEvent::query()->where('incident_id', $incident->id)->orderBy('id')->pluck('type')->all();
        $this->assertSame(['status_changed', 'status_changed', 'review_updated', 'status_changed'], $types);
        $this->assertSame(3, AuditLog::query()->where('action', 'incidents.status_changed')->count());
        $this->assertSame('Checking gateway logs', AuditLog::query()->where('action', 'incidents.status_changed')->orderBy('id')->value('reason'));
    }

    public function test_notes_and_detail_updates_are_recorded_on_the_timeline(): void
    {
        $manager = $this->actingAsStaff(['incidents.view', 'incidents.manage']);
        $colleague = $this->makeStaff(['incidents.manage']);
        $incident = Incident::factory()->create(['owner_id' => $manager->id, 'severity' => 'p2']);

        $this->post("/admin/incidents/{$incident->public_id}/notes", ['message' => 'Contacted the provider'])->assertRedirect()->assertSessionHasNoErrors();
        $this->put("/admin/incidents/{$incident->public_id}", ['severity' => 'p1', 'owner' => $colleague->public_id, 'started_at' => ''])->assertRedirect()->assertSessionHasNoErrors();

        $incident->refresh();
        $this->assertSame('p1', $incident->severity->value);
        $this->assertSame($colleague->id, $incident->owner_id);
        $this->assertNotNull($incident->started_at, 'an empty start time on edit keeps the recorded one');

        $events = IncidentEvent::query()->where('incident_id', $incident->id)->orderBy('id')->get();
        $this->assertSame(['note', 'owner_changed'], $events->pluck('type')->all());
        $this->assertSame('Contacted the provider', $events->first()->message);
        $this->assertTrue(AuditLog::query()->where('action', 'incidents.updated')->exists());

        $this->get("/admin/incidents/{$incident->public_id}")->assertInertia(fn (Assert $page) => $page->has('events', 2)->where('transitions', ['investigating', 'mitigated', 'resolved']));
    }

    public function test_index_filters(): void
    {
        $manager = $this->actingAsStaff(['incidents.view', 'incidents.manage']);
        Incident::factory()->create(['title' => 'Charging map outage', 'severity' => 'p1', 'owner_id' => $manager->id]);
        Incident::factory()->create(['severity' => 'p3']);
        Incident::factory()->resolved()->create(['severity' => 'p2']);

        $this->get('/admin/incidents')->assertInertia(fn (Assert $page) => $page->has('incidents.data', 2)->where('filters.status', 'active'));
        $this->get('/admin/incidents?status=all')->assertInertia(fn (Assert $page) => $page->has('incidents.data', 3));
        $this->get('/admin/incidents?status=resolved')->assertInertia(fn (Assert $page) => $page->has('incidents.data', 1));
        $this->get('/admin/incidents?owner=me')->assertInertia(fn (Assert $page) => $page->has('incidents.data', 1));
        $this->get('/admin/incidents?q=charging&severity=p1')->assertInertia(fn (Assert $page) => $page->has('incidents.data', 1)->where('incidents.data.0.title', 'Charging map outage'));
    }
}
