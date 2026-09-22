<?php

namespace App\Modules\Members\Services;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Members\Models\ConsentLog;
use App\Modules\Members\Models\Enums\ConsentType;
use Illuminate\Support\Facades\DB;

/**
 * Marketing consent state derived from the append-only consent_logs table
 * (latest row per type wins). Each change writes a new row; nothing is updated in place.
 */
final class ConsentService
{
    public function __construct(private AuditService $audit) {}

    /** @return array<string, bool> e.g. ['marketing_email' => true, ...] */
    public function marketingState(User $user): array
    {
        $latest = ConsentLog::query()->where('user_id', $user->id)
            ->whereIn('consent_type', array_map(fn (ConsentType $t) => $t->value, ConsentType::marketing()))
            ->orderByDesc('id')->get()->unique(fn (ConsentLog $log) => $log->consent_type->value);

        $state = [];
        foreach (ConsentType::marketing() as $type) {
            $row = $latest->first(fn (ConsentLog $log) => $log->consent_type === $type);
            $state[$type->value] = $row ? $row->isGranted() : false;
        }

        return $state;
    }

    /**
     * @param  array<string, bool>  $wanted  consent_type => granted
     * @return array<string, bool> the changed types
     */
    public function updateMarketing(User $user, array $wanted, string $source = 'web', ?User $actor = null): array
    {
        $current = $this->marketingState($user);
        $changed = [];

        DB::transaction(function () use ($user, $wanted, $current, $source, $actor, &$changed) {
            foreach (ConsentType::marketing() as $type) {
                if (! array_key_exists($type->value, $wanted)) {
                    continue;
                }
                $granted = (bool) $wanted[$type->value];
                if ($granted === $current[$type->value]) {
                    continue;
                }
                ConsentLog::create([
                    'user_id' => $user->id,
                    'consent_type' => $type,
                    'version' => null,
                    'accepted_at' => $granted ? now() : null,
                    'withdrawn_at' => $granted ? null : now(),
                    'source' => $source,
                    'ip_address' => request()?->ip(),
                    'created_at' => now(),
                ]);
                $changed[$type->value] = $granted;
            }
            if ($changed !== []) {
                $this->audit->log('members.consents_updated', $user->membership ?? $user, old: array_intersect_key($current, $changed), new: $changed, actor: $actor ?? $user);
            }
        });

        return $changed;
    }

    /** @return array<int, array<string, mixed>> recent consent history rows for display */
    public function history(User $user, int $limit = 50): array
    {
        return ConsentLog::query()->where('user_id', $user->id)->orderByDesc('id')->limit($limit)->get()
            ->map(fn (ConsentLog $log) => [
                'id' => $log->id,
                'type' => $log->consent_type->value,
                'label' => $log->consent_type->label(),
                'version' => $log->version,
                'granted' => $log->isGranted(),
                'accepted_at' => $log->accepted_at?->toIso8601String(),
                'withdrawn_at' => $log->withdrawn_at?->toIso8601String(),
                'source' => $log->source,
                'created_at' => $log->created_at?->toIso8601String(),
            ])->all();
    }
}
