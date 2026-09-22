<?php

namespace App\Modules\Members\Console;

use App\Modules\Members\Actions\ChangeMembershipStatus;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Membership;
use App\Modules\System\Services\Settings;
use Illuminate\Console\Command;

/**
 * Moves active memberships whose expires_at has passed to `expired` (system actor, full history/audit).
 * Runs daily but is a no-op unless the `members.auto_expire_enabled` setting is on.
 */
class ExpireMembershipsCommand extends Command
{
    protected $signature = 'members:expire {--force : Run even when members.auto_expire_enabled is off}';

    protected $description = 'Expire active memberships whose expiry date has passed';

    public function handle(ChangeMembershipStatus $action): int
    {
        if (! $this->option('force') && ! Settings::bool('members.auto_expire_enabled', false)) {
            $this->info('Automatic expiry is disabled (members.auto_expire_enabled).');

            return self::SUCCESS;
        }

        $expired = 0;
        Membership::query()->active()->whereNotNull('expires_at')->where('expires_at', '<', now())
            ->orderBy('id')->chunkById(200, function ($memberships) use ($action, &$expired) {
                foreach ($memberships as $membership) {
                    $action->execute($membership, MembershipStatus::Expired, null, 'expiry_date_passed');
                    $expired++;
                }
            });

        $this->info("Expired {$expired} membership(s).");

        return self::SUCCESS;
    }
}
