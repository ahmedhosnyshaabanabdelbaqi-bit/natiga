<?php

declare(strict_types=1);

namespace App\Modules\Access\Services;

use App\Modules\Access\Models\AuditLog;
use App\Modules\Core\Services\PosContext;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Request;

/**
 * Append-only trail for sensitive operations. The table itself refuses UPDATE
 * and DELETE (trigger installed by the access migration), so nothing in the
 * operating UI can rewrite it.
 *
 * Passwords, PINs and payment credentials are stripped before writing.
 */
class AuditService
{
    private const REDACTED = ['password', 'password_confirmation', 'pin', 'pin_hash', 'card_number', 'cvv', 'token', 'remember_token'];

    public function __construct(private readonly PosContext $context) {}

    /**
     * @param  array<string,mixed>|null  $old
     * @param  array<string,mixed>|null  $new
     */
    public function log(
        string $action,
        ?Model $subject = null,
        ?array $old = null,
        ?array $new = null,
        ?string $reason = null,
        ?int $approvalId = null,
    ): AuditLog {
        return AuditLog::query()->create([
            'action' => $action,
            'auditable_type' => $subject ? $subject::class : null,
            'auditable_id' => $subject?->getKey(),
            'user_id' => $this->context->userId(),
            'branch_id' => $this->context->branchId(),
            'terminal_id' => $this->context->terminalId(),
            'approval_id' => $approvalId,
            'old_values' => $old ? $this->redact($old) : null,
            'new_values' => $new ? $this->redact($new) : null,
            'reason' => $reason,
            'ip' => $this->safeIp(),
            'user_agent' => substr((string) Request::userAgent(), 0, 255) ?: null,
        ]);
    }

    private function safeIp(): ?string
    {
        try {
            return Request::ip();
        } catch (\Throwable) {
            return null;
        }
    }

    /** @param array<string,mixed> $values */
    private function redact(array $values): array
    {
        foreach ($values as $key => $value) {
            if (in_array(strtolower((string) $key), self::REDACTED, true)) {
                $values[$key] = '***';
            } elseif (is_array($value)) {
                $values[$key] = $this->redact($value);
            }
        }

        return $values;
    }
}
