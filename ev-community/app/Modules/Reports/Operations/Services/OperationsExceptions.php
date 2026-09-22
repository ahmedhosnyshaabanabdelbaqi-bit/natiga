<?php

namespace App\Modules\Reports\Operations\Services;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Rbac\Services\PermissionRegistry;
use App\Modules\Reports\Operations\Models\Enums\ExceptionCategory;
use App\Modules\Reports\Operations\Models\Enums\ExceptionSeverity;
use App\Modules\Reports\Operations\Models\Enums\ExceptionStatus;
use App\Modules\Reports\Operations\Models\OperationsException;
use App\Support\Exceptions\DomainException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

/**
 * Exception Center: modules/commands/jobs raise operational exceptions here instead of silently logging.
 *
 *   app(OperationsExceptions::class)->raise('finance', 'p1', 'Unallocated approved payment PAY-2026-000012',
 *       ['payment_id' => 12], dedupKey: 'finance:unallocated:12', source: 'finance:reconcile');
 *
 * Deduplication: while an exception with the same dedup_key is open/assigned, raising it again increments
 * `occurrences` and refreshes `detected_at` (severity only escalates, never de-escalates). P0 raises also
 * write a critical log line + security event and notify users holding `operations.manage` when the
 * Notifications module is present.
 */
final class OperationsExceptions
{
    public const NOTIFY_CLASS = 'App\\Modules\\Notifications\\Services\\Notify';

    public function __construct(private readonly AuditService $audit) {}

    /** @param  array<string, mixed>  $details */
    public function raise(string $category, string $severity, string $title, array $details = [], ?string $dedupKey = null, ?string $source = null): OperationsException
    {
        $categoryEnum = ExceptionCategory::tryFrom($category) ?? throw new InvalidArgumentException("Unknown exception category [{$category}]");
        $severityEnum = ExceptionSeverity::tryFrom($severity) ?? throw new InvalidArgumentException("Unknown exception severity [{$severity}]");
        $title = mb_substr(trim($title), 0, 255);
        $dedupKey = $dedupKey !== null ? mb_substr($dedupKey, 0, 191) : null;
        $source = $source !== null ? mb_substr($source, 0, 120) : null;

        $attempt = function () use ($categoryEnum, $severityEnum, $title, $details, $dedupKey, $source): array {
            return DB::transaction(function () use ($categoryEnum, $severityEnum, $title, $details, $dedupKey, $source): array {
                if ($dedupKey !== null) {
                    $existing = OperationsException::query()->where('dedup_key', $dedupKey)->live()->lockForUpdate()->first();
                    if ($existing) {
                        $existing->occurrences = $existing->occurrences + 1;
                        $existing->detected_at = now();
                        if ($severityEnum->isMoreSevereThan($existing->severity)) {
                            $existing->severity = $severityEnum;
                        }
                        if ($details !== []) {
                            $existing->details = array_replace($existing->details ?? [], $details);
                        }
                        $existing->save();

                        return [$existing, false];
                    }
                }
                $row = OperationsException::query()->create([
                    'category' => $categoryEnum,
                    'severity' => $severityEnum,
                    'title' => $title,
                    'details' => $details === [] ? null : $details,
                    'source' => $source,
                    'dedup_key' => $dedupKey,
                    'status' => ExceptionStatus::Open,
                    'detected_at' => now(),
                    'occurrences' => 1,
                ]);

                return [$row, true];
            });
        };

        try {
            [$exception, $created] = $attempt();
        } catch (UniqueConstraintViolationException) {
            [$exception, $created] = $attempt(); // concurrent raise with the same dedup key: second pass increments
        }

        if ($created) {
            Log::log($severityEnum === ExceptionSeverity::P0 ? 'critical' : ($severityEnum === ExceptionSeverity::P1 ? 'error' : 'warning'), 'operations.exception_raised', [
                'exception' => $exception->public_id, 'category' => $category, 'severity' => $severity, 'title' => $title, 'source' => $source, 'dedup_key' => $dedupKey,
            ]);
            if ($severityEnum === ExceptionSeverity::P0) {
                $this->alertP0($exception);
            }
        } else {
            Log::warning('operations.exception_recurred', ['exception' => $exception->public_id, 'occurrences' => $exception->occurrences, 'dedup_key' => $dedupKey]);
        }

        return $exception;
    }

    public function assign(OperationsException $exception, ?User $assignee, User $actor, ?string $note = null): OperationsException
    {
        return DB::transaction(function () use ($exception, $assignee, $actor, $note) {
            $exception = $this->lock($exception);
            if (! $exception->status->isLive()) {
                throw DomainException::because('operations.exceptions.errors.not_live', ['status' => $exception->status->label()]);
            }
            $old = ['status' => $exception->status->value, 'assigned_to' => $exception->assigned_to];
            $exception->assigned_to = $assignee?->id;
            $exception->status = $assignee ? ExceptionStatus::Assigned : ExceptionStatus::Open;
            $exception->save();
            $this->audit->log('operations.exception_assigned', $exception, old: $old, new: ['status' => $exception->status->value, 'assigned_to' => $assignee?->id, 'assignee' => $assignee?->name], reason: $note, actor: $actor);

            return $exception;
        });
    }

    public function resolve(OperationsException $exception, User $actor, ?string $resolution = null): OperationsException
    {
        return DB::transaction(function () use ($exception, $actor, $resolution) {
            $exception = $this->lock($exception);
            if ($exception->status === ExceptionStatus::Resolved) {
                return $exception;
            }
            $old = ['status' => $exception->status->value];
            $exception->forceFill(['status' => ExceptionStatus::Resolved, 'resolved_at' => now(), 'resolved_by' => $actor->id, 'resolution' => $resolution])->save();
            $this->audit->log('operations.exception_resolved', $exception, old: $old, new: ['status' => 'resolved', 'resolution' => $resolution], reason: $resolution, actor: $actor);

            return $exception;
        });
    }

    public function ignore(OperationsException $exception, User $actor, string $reason): OperationsException
    {
        return DB::transaction(function () use ($exception, $actor, $reason) {
            $exception = $this->lock($exception);
            if (! $exception->status->isLive()) {
                throw DomainException::because('operations.exceptions.errors.not_live', ['status' => $exception->status->label()]);
            }
            $old = ['status' => $exception->status->value];
            $exception->forceFill(['status' => ExceptionStatus::Ignored, 'resolved_at' => now(), 'resolved_by' => $actor->id, 'resolution' => $reason])->save();
            $this->audit->log('operations.exception_ignored', $exception, old: $old, new: ['status' => 'ignored'], reason: $reason, actor: $actor);

            return $exception;
        });
    }

    /**
     * Automatic recovery for keyed exceptions (health checks passing again, integration back online).
     * Returns null when nothing was open for that key.
     */
    public function resolveByKey(string $dedupKey, ?string $resolution = null, ?User $actor = null): ?OperationsException
    {
        return DB::transaction(function () use ($dedupKey, $resolution, $actor) {
            $exception = OperationsException::query()->where('dedup_key', $dedupKey)->live()->lockForUpdate()->first();
            if (! $exception) {
                return null;
            }
            $old = ['status' => $exception->status->value];
            $exception->forceFill(['status' => ExceptionStatus::Resolved, 'resolved_at' => now(), 'resolved_by' => $actor?->id, 'resolution' => $resolution])->save();
            $this->audit->log('operations.exception_resolved', $exception, old: $old, new: ['status' => 'resolved', 'auto' => $actor === null], reason: $resolution, actor: $actor, actorType: $actor ? null : 'system');

            return $exception;
        });
    }

    /** @return array<string, int> live exceptions per severity (p0..p3) */
    public function countsBySeverity(): array
    {
        $counts = array_fill_keys(ExceptionSeverity::values(), 0);
        foreach (OperationsException::query()->live()->selectRaw('severity, count(*) as aggregate')->groupBy('severity')->get() as $row) {
            $counts[$row->severity instanceof ExceptionSeverity ? $row->severity->value : (string) $row->severity] = (int) $row->aggregate;
        }

        return $counts;
    }

    private function lock(OperationsException $exception): OperationsException
    {
        return OperationsException::query()->whereKey($exception->id)->lockForUpdate()->firstOrFail();
    }

    private function alertP0(OperationsException $exception): void
    {
        SecurityEvents::record(null, 'operations_p0_exception', ['exception' => $exception->public_id, 'category' => $exception->category->value, 'title' => $exception->title, 'source' => $exception->source], 'critical');
        if (! class_exists(self::NOTIFY_CLASS)) {
            return;
        }
        try {
            $notify = app(self::NOTIFY_CLASS);
            $recipients = User::query()->where('status', User::STATUS_ACTIVE)
                ->where(fn ($q) => $q->permission('operations.manage')->orWhereHas('roles', fn ($r) => $r->whereIn('name', PermissionRegistry::SUPER_ROLES)))
                ->get();
            foreach ($recipients as $user) {
                $notify->send($user, 'operations.p0_exception', [
                    'title' => $exception->title, 'category' => $exception->category->value, 'exception_id' => $exception->public_id, 'url' => '/admin/operations?severity=p0',
                ], 'system', true, 'ops-p0:'.$exception->public_id.':'.$user->id);
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
