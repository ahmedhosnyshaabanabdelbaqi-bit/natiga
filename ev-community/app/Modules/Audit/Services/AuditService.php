<?php

namespace App\Modules\Audit\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

/**
 * Central audit trail. Every sensitive state change calls `log()`.
 * Never put secrets or full tokens in old/new values.
 */
class AuditService
{
    private const REDACTED_KEYS = ['password', 'password_hash', 'two_factor_secret', 'two_factor_recovery_codes', 'remember_token', 'token', 'secret', 'api_key', 'verification_token'];

    /**
     * @param  array<string, mixed>  $old
     * @param  array<string, mixed>  $new
     */
    public function log(string $action, ?Model $entity = null, array $old = [], array $new = [], ?string $reason = null, ?User $actor = null, ?string $actorType = null, ?string $entityLabel = null): AuditLog
    {
        $request = app()->runningInConsole() ? null : request();
        $actor ??= Auth::user();

        $row = AuditLog::query()->create([
            'actor_id' => $actor?->id,
            'actor_type' => $actorType ?? ($actor ? 'user' : (app()->runningInConsole() ? 'system' : 'system')),
            'action' => $action,
            'entity_type' => $entity ? $entity->getMorphClass() : null,
            'entity_id' => $entity?->getKey(),
            'entity_label' => $entityLabel ?? ($entity ? $this->labelFor($entity) : null),
            'old_values' => $old === [] ? null : $this->redact($old),
            'new_values' => $new === [] ? null : $this->redact($new),
            'reason' => $reason,
            'request_id' => ev_request_id(),
            'ip_address' => $request?->ip(),
            'user_agent' => $request ? mb_substr((string) $request->userAgent(), 0, 255) : null,
            'created_at' => now(),
        ]);

        Log::channel(config('logging.default'))->info('audit', ['action' => $action, 'entity' => $row->entity_type, 'entity_id' => $row->entity_id, 'actor_id' => $row->actor_id, 'request_id' => $row->request_id]);

        return $row;
    }

    /** Convenience: diff two attribute arrays and log only changed keys. */
    public function logChanges(string $action, Model $entity, array $before, array $after, ?string $reason = null, ?User $actor = null): ?AuditLog
    {
        $old = [];
        $new = [];
        foreach ($after as $key => $value) {
            if (($before[$key] ?? null) != $value) {
                $old[$key] = $before[$key] ?? null;
                $new[$key] = $value;
            }
        }
        if ($old === [] && $new === []) {
            return null;
        }

        return $this->log($action, $entity, $old, $new, $reason, $actor);
    }

    private function labelFor(Model $entity): ?string
    {
        foreach (['order_number', 'receipt_number', 'payment_number', 'member_number', 'ticket_number', 'shipment_number', 'booking_number', 'number', 'code', 'sku', 'name', 'title', 'key', 'email'] as $attr) {
            $value = $entity->getAttribute($attr);
            if (is_string($value) && $value !== '') {
                return mb_substr($value, 0, 255);
            }
        }

        return $entity->getAttribute('public_id');
    }

    private function redact(array $values): array
    {
        foreach ($values as $key => $value) {
            if (in_array(strtolower((string) $key), self::REDACTED_KEYS, true)) {
                $values[$key] = '[redacted]';
            } elseif (is_array($value)) {
                $values[$key] = $this->redact($value);
            }
        }

        return $values;
    }
}
