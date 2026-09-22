<?php

namespace App\Modules\Audit\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;

/**
 * Filtering/serialization for the audit log viewer and CSV export. Whitelisted filters only.
 */
final class AuditQuery
{
    public const ALLOWED_FILTERS = ['actor', 'action', 'entity_type', 'entity_id', 'request_id', 'from', 'to'];

    public const EXPORT_MAX_ROWS = 10000;

    /**
     * @param  array<string, mixed>  $filters
     * @return Builder<AuditLog>
     */
    public function build(array $filters): Builder
    {
        $query = AuditLog::query()->with('actor:id,name,email,public_id');

        if (($actor = trim((string) ($filters['actor'] ?? ''))) !== '') {
            if (ctype_digit($actor)) {
                $query->where('actor_id', (int) $actor);
            } else {
                $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $actor).'%';
                $query->whereHas('actor', fn (Builder $q) => $q->where('name', 'ILIKE', $like)->orWhere('email', 'ILIKE', $like));
            }
        }
        if (! empty($filters['action'])) {
            $action = (string) $filters['action'];
            str_ends_with($action, '*') ? $query->where('action', 'like', rtrim($action, '*').'%') : $query->where('action', $action);
        }
        if (! empty($filters['entity_type'])) {
            $query->where('entity_type', (string) $filters['entity_type']);
        }
        if (! empty($filters['entity_id']) && ctype_digit((string) $filters['entity_id'])) {
            $query->where('entity_id', (int) $filters['entity_id']);
        }
        if (! empty($filters['request_id'])) {
            $query->where('request_id', (string) $filters['request_id']);
        }
        if ($from = $this->date($filters['from'] ?? null)) {
            $query->where('created_at', '>=', $from->startOfDay());
        }
        if ($to = $this->date($filters['to'] ?? null)) {
            $query->where('created_at', '<=', $to->endOfDay());
        }

        return $query->orderByDesc('id');
    }

    /** @return string[] */
    public function distinctActions(): array
    {
        return Cache::remember('ev.audit.actions.v1', now()->addMinutes(5), fn () => AuditLog::query()->select('action')->distinct()->orderBy('action')->pluck('action')->all());
    }

    /** @return string[] */
    public function distinctEntityTypes(): array
    {
        return Cache::remember('ev.audit.entity_types.v1', now()->addMinutes(5), fn () => AuditLog::query()->whereNotNull('entity_type')->select('entity_type')->distinct()->orderBy('entity_type')->pluck('entity_type')->all());
    }

    /** @return array<string, mixed> */
    public function summary(AuditLog $log): array
    {
        /** @var User|null $actor */
        $actor = $log->actor;

        return [
            'id' => $log->id,
            'action' => $log->action,
            'actor' => $actor ? ['id' => $actor->public_id, 'name' => $actor->name, 'email' => $actor->email] : null,
            'actor_type' => $log->actor_type,
            'entity_type' => $log->entity_type ? class_basename($log->entity_type) : null,
            'entity_type_full' => $log->entity_type,
            'entity_id' => $log->entity_id,
            'entity_label' => $log->entity_label,
            'has_changes' => $log->old_values !== null || $log->new_values !== null,
            'reason' => $log->reason,
            'request_id' => $log->request_id,
            'created_at' => $log->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    public function detail(AuditLog $log): array
    {
        return $this->summary($log) + [
            'old_values' => $log->old_values,
            'new_values' => $log->new_values,
            'ip_address' => $log->ip_address,
            'user_agent' => $log->user_agent,
        ];
    }

    private function date(mixed $value): ?CarbonImmutable
    {
        if (! is_string($value) || $value === '') {
            return null;
        }
        try {
            return CarbonImmutable::parse($value, config('app.timezone'));
        } catch (\Throwable) {
            return null;
        }
    }
}
