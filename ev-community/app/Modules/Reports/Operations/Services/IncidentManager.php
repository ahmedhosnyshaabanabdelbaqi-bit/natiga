<?php

namespace App\Modules\Reports\Operations\Services;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Reports\Operations\Models\Enums\ExceptionSeverity;
use App\Modules\Reports\Operations\Models\Enums\IncidentStatus;
use App\Modules\Reports\Operations\Models\Incident;
use App\Modules\Reports\Operations\Models\IncidentEvent;
use App\Support\Exceptions\DomainException;
use App\Support\Sequence\NumberSequence;
use Illuminate\Support\Facades\DB;

/**
 * Incident lifecycle: open → investigating → mitigated → resolved → closed (with reopen paths).
 * Every transition writes an incident event (timeline) and an audit row. Closing requires the
 * post-incident review basics (root cause + resolution).
 */
final class IncidentManager
{
    public const REVIEW_FIELDS = ['what_went_well', 'what_went_wrong', 'action_items', 'timeline_summary'];

    public function __construct(private readonly AuditService $audit) {}

    /** @param  array<string, mixed>  $data */
    public function create(array $data, User $actor): Incident
    {
        return DB::transaction(function () use ($data, $actor) {
            $incident = Incident::query()->create([
                'number' => NumberSequence::next('incident'),
                'severity' => ExceptionSeverity::from($data['severity']),
                'title' => $data['title'],
                'affected_module' => $data['affected_module'] ?? null,
                'impact' => $data['impact'] ?? null,
                'status' => IncidentStatus::Open,
                'started_at' => $data['started_at'] ?? now(),
                'detected_at' => $data['detected_at'] ?? now(),
                'owner_id' => $data['owner_id'] ?? $actor->id,
                'created_by' => $actor->id,
            ]);
            $this->event($incident, 'created', $data['impact'] ?? null, $actor, ['severity' => $incident->severity->value]);
            $this->audit->log('incidents.created', $incident, new: ['number' => $incident->number, 'severity' => $incident->severity->value, 'title' => $incident->title], actor: $actor);

            return $incident;
        });
    }

    /** @param  array<string, mixed>  $data */
    public function update(Incident $incident, array $data, User $actor): Incident
    {
        return DB::transaction(function () use ($incident, $data, $actor) {
            $incident = $this->lock($incident);
            $before = $this->snapshot($incident);
            $incident->fill(array_intersect_key($data, array_flip(['title', 'affected_module', 'impact', 'started_at', 'detected_at', 'owner_id'])));
            if (isset($data['severity'])) {
                $incident->severity = ExceptionSeverity::from($data['severity']);
            }
            $incident->save();
            $after = $this->snapshot($incident);
            if ($before !== $after) {
                $this->event($incident, $before['owner_id'] !== $after['owner_id'] ? 'owner_changed' : 'updated', null, $actor, ['changed' => array_keys(array_diff_assoc($after, $before))]);
                $this->audit->logChanges('incidents.updated', $incident, $before, $after, actor: $actor);
            }

            return $incident;
        });
    }

    public function transition(Incident $incident, IncidentStatus $to, User $actor, ?string $note = null): Incident
    {
        return DB::transaction(function () use ($incident, $to, $actor, $note) {
            $incident = $this->lock($incident);
            $from = $incident->status;
            if ($from === $to) {
                return $incident;
            }
            if (! $from->canTransitionTo($to)) {
                throw DomainException::because('core.errors.invalid_state_transition', ['from' => $from->label(), 'to' => $to->label()], 'status');
            }
            if ($to === IncidentStatus::Closed && (blank($incident->root_cause) || blank($incident->resolution))) {
                throw DomainException::because('operations.incidents.errors.review_required', [], 'status');
            }
            $incident->status = $to;
            if ($to === IncidentStatus::Resolved) {
                $incident->resolved_at = $incident->resolved_at ?? now();
            } elseif ($to->isActive()) {
                $incident->resolved_at = null;
            }
            $incident->save();
            $this->event($incident, 'status_changed', $note, $actor, ['from' => $from->value, 'to' => $to->value]);
            $this->audit->log('incidents.status_changed', $incident, old: ['status' => $from->value], new: ['status' => $to->value], reason: $note, actor: $actor);

            return $incident;
        });
    }

    public function addNote(Incident $incident, string $message, User $actor): IncidentEvent
    {
        return $this->event($incident, 'note', $message, $actor);
    }

    /** @param  array<string, mixed>  $data */
    public function updateReview(Incident $incident, array $data, User $actor): Incident
    {
        return DB::transaction(function () use ($incident, $data, $actor) {
            $incident = $this->lock($incident);
            $before = ['root_cause' => $incident->root_cause, 'resolution' => $incident->resolution, 'corrective_actions' => $incident->corrective_actions, 'review' => $incident->review];
            $review = array_intersect_key((array) ($data['review'] ?? []), array_flip(self::REVIEW_FIELDS));
            $incident->forceFill([
                'root_cause' => $data['root_cause'] ?? null,
                'resolution' => $data['resolution'] ?? null,
                'corrective_actions' => $data['corrective_actions'] ?? null,
                'review' => array_filter($review, fn ($v) => $v !== null && $v !== '') ?: null,
            ])->save();
            $after = ['root_cause' => $incident->root_cause, 'resolution' => $incident->resolution, 'corrective_actions' => $incident->corrective_actions, 'review' => $incident->review];
            if ($before != $after) {
                $this->event($incident, 'review_updated', null, $actor);
                $this->audit->logChanges('incidents.review_updated', $incident, $before, $after, actor: $actor);
            }

            return $incident;
        });
    }

    private function event(Incident $incident, string $type, ?string $message, ?User $actor, array $meta = []): IncidentEvent
    {
        return IncidentEvent::query()->create([
            'incident_id' => $incident->id, 'type' => $type, 'message' => $message, 'meta' => $meta ?: null, 'created_by' => $actor?->id, 'created_at' => now(),
        ]);
    }

    private function lock(Incident $incident): Incident
    {
        return Incident::query()->whereKey($incident->id)->lockForUpdate()->firstOrFail();
    }

    /** @return array<string, mixed> */
    private function snapshot(Incident $incident): array
    {
        return [
            'title' => $incident->title, 'severity' => $incident->severity->value, 'affected_module' => $incident->affected_module, 'impact' => $incident->impact,
            'started_at' => $incident->started_at?->toIso8601String(), 'detected_at' => $incident->detected_at?->toIso8601String(), 'owner_id' => $incident->owner_id,
        ];
    }
}
