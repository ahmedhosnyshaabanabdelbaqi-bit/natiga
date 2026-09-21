<?php

namespace App\Domain\Shared;

use App\Models\AuditLog;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

/**
 * سجل المراجعة — من نفّذ، ومتى، وماذا تغيّر، ولماذا.
 * لا يُحذف من التطبيق؛ صلاحية الحذف غير معرّفة أصلًا.
 */
class AuditLogger
{
    public function log(
        string $action,
        string $entityType,
        ?int $entityId = null,
        ?string $entityNo = null,
        ?array $before = null,
        ?array $after = null,
        ?string $reason = null,
        ?int $companyId = null,
    ): AuditLog {
        $user = Auth::user();

        return AuditLog::create([
            'company_id' => $companyId ?? $user?->company_id,
            'user_id' => $user?->id,
            'user_label' => $user?->name,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'entity_no' => $entityNo,
            'before' => $before,
            'after' => $after,
            'reason' => $reason,
            'ip_address' => Request::ip(),
            'user_agent' => substr((string) Request::userAgent(), 0, 500),
            'created_at' => now(),
        ]);
    }
}
