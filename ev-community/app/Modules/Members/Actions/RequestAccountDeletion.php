<?php

namespace App\Modules\Members\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Members\Models\AccountDeletionRequest;
use App\Modules\Members\Models\Enums\DeletionRequestStatus;
use App\Support\Exceptions\DomainException;
use Illuminate\Support\Facades\DB;

final class RequestAccountDeletion
{
    public function __construct(private AuditService $audit) {}

    public function execute(User $user, ?string $reason = null): AccountDeletionRequest
    {
        return DB::transaction(function () use ($user, $reason) {
            if (AccountDeletionRequest::query()->where('user_id', $user->id)->open()->lockForUpdate()->exists()) {
                throw DomainException::because('privacy.deletion.errors.already_open');
            }
            $request = AccountDeletionRequest::create([
                'user_id' => $user->id,
                'status' => DeletionRequestStatus::Requested,
                'reason' => $reason,
                'requested_at' => now(),
            ]);
            $this->audit->log('members.deletion_requested', $request, new: ['status' => DeletionRequestStatus::Requested->value], reason: $reason, actor: $user);

            return $request;
        });
    }
}
