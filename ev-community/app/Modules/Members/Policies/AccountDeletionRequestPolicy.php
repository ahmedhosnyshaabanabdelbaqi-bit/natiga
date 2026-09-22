<?php

namespace App\Modules\Members\Policies;

use App\Models\User;
use App\Modules\Members\Models\AccountDeletionRequest;

class AccountDeletionRequestPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('members.delete_requests');
    }

    public function view(User $user, AccountDeletionRequest $request): bool
    {
        return $user->can('members.delete_requests') || $request->user_id === $user->id;
    }

    public function process(User $user, AccountDeletionRequest $request): bool
    {
        return $user->can('members.delete_requests');
    }
}
