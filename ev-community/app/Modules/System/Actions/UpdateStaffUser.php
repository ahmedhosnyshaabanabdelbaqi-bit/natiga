<?php

namespace App\Modules\System\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\System\Services\UserAccessRules;
use Illuminate\Support\Facades\DB;

final class UpdateStaffUser
{
    public function __construct(private readonly AuditService $audit, private readonly UserAccessRules $rules) {}

    /** @param  array{name: string, email: string, mobile?: ?string, preferred_locale?: ?string}  $data */
    public function execute(User $target, array $data, User $actor): User
    {
        if (! $actor->is($target)) {
            $this->rules->assertCanManage($actor, $target);
        }

        return DB::transaction(function () use ($target, $data, $actor) {
            $before = ['name' => $target->name, 'email' => $target->email, 'mobile' => $target->mobile, 'preferred_locale' => $target->preferred_locale];
            $after = [
                'name' => trim($data['name']),
                'email' => strtolower(trim($data['email'])),
                'mobile' => $data['mobile'] ?? null,
                'preferred_locale' => $data['preferred_locale'] ?? $target->preferred_locale,
            ];
            if ($after['email'] !== $before['email']) {
                $target->email_verified_at = null;
            }
            $target->fill($after)->save();
            $this->audit->logChanges('users.updated', $target, $before, $after, actor: $actor);
            if ($after['email'] !== $before['email']) {
                SecurityEvents::record($target, 'email_changed_by_admin', ['by' => $actor->id], 'warning');
            }

            return $target;
        });
    }
}
