<?php

namespace App\Modules\System\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\System\Services\UserAccessRules;
use Illuminate\Support\Facades\DB;

final class ReactivateUser
{
    public function __construct(private readonly AuditService $audit, private readonly UserAccessRules $rules) {}

    public function execute(User $target, User $actor, ?string $reason = null): User
    {
        $this->rules->assertCanManage($actor, $target);

        return DB::transaction(function () use ($target, $actor, $reason) {
            $target = User::query()->whereKey($target->id)->lockForUpdate()->firstOrFail();
            if ($target->status === User::STATUS_ACTIVE) {
                return $target;
            }
            $target->forceFill(['status' => User::STATUS_ACTIVE, 'disabled_at' => null, 'disabled_by' => null])->save();
            $this->audit->log('users.reactivated', $target, old: ['status' => User::STATUS_DISABLED], new: ['status' => User::STATUS_ACTIVE], reason: $reason, actor: $actor);
            SecurityEvents::record($target, 'account_reactivated', ['by' => $actor->id], 'warning');

            return $target;
        });
    }
}
