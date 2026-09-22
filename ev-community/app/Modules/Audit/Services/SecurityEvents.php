<?php

namespace App\Modules\Audit\Services;

use App\Models\User;
use App\Modules\Audit\Models\SecurityEvent;

class SecurityEvents
{
    public const CRITICAL = ['mfa_disabled', 'role_changed', 'permission_escalation', 'super_admin_created', 'integration_credentials_changed', 'account_disabled', 'large_refund_approved'];

    public static function record(?User $user, string $eventType, array $meta = [], ?string $severity = null): SecurityEvent
    {
        $request = app()->runningInConsole() ? null : request();

        return SecurityEvent::query()->create([
            'user_id' => $user?->id,
            'event_type' => $eventType,
            'ip_address' => $request?->ip(),
            'user_agent' => $request ? mb_substr((string) $request->userAgent(), 0, 255) : null,
            'meta' => $meta ?: null,
            'severity' => $severity ?? (in_array($eventType, self::CRITICAL, true) ? 'critical' : 'info'),
            'created_at' => now(),
        ]);
    }
}
