<?php

namespace App\Modules\Members\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Members\Models\AccountDeletionRequest;
use App\Modules\Members\Models\Enums\DeletionRequestStatus;
use App\Support\Exceptions\DomainException;
use Illuminate\Support\Facades\DB;

/** Non-destructive workflow steps of a deletion request (review / reject). Completion is AnonymizeMember. */
final class ProcessDeletionRequest
{
    public function __construct(private AuditService $audit) {}

    public function review(AccountDeletionRequest $request, User $actor): AccountDeletionRequest
    {
        return $this->move($request, DeletionRequestStatus::UnderReview, $actor, null, null, 'members.deletion_request_reviewed');
    }

    public function reject(AccountDeletionRequest $request, User $actor, string $reason, ?string $notes = null): AccountDeletionRequest
    {
        if (mb_strlen(trim($reason)) < 5) {
            throw DomainException::because('core.errors.reason_required', field: 'reason');
        }

        return $this->move($request, DeletionRequestStatus::Rejected, $actor, $reason, $notes, 'members.deletion_request_rejected');
    }

    private function move(AccountDeletionRequest $request, DeletionRequestStatus $to, User $actor, ?string $reason, ?string $notes, string $action): AccountDeletionRequest
    {
        return DB::transaction(function () use ($request, $to, $actor, $reason, $notes, $action) {
            /** @var AccountDeletionRequest $locked */
            $locked = AccountDeletionRequest::query()->whereKey($request->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === $to) {
                return $locked;
            }
            if (! $locked->isOpen()) {
                throw DomainException::because('privacy.deletion.errors.not_open');
            }
            $from = $locked->status;
            $locked->forceFill([
                'status' => $to,
                'processed_at' => $to === DeletionRequestStatus::Rejected ? now() : null,
                'processed_by' => $to === DeletionRequestStatus::Rejected ? $actor->id : null,
                'notes' => $notes ?? $locked->notes,
            ])->save();
            $this->audit->log($action, $locked, old: ['status' => $from->value], new: ['status' => $to->value], reason: $reason, actor: $actor);

            return $locked;
        });
    }
}
