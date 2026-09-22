<?php

namespace App\Modules\Rbac\Console;

use App\Modules\Rbac\Services\RbacSync;
use Illuminate\Console\Command;

class SyncPermissionsCommand extends Command
{
    protected $signature = 'ev:sync-permissions {--reset : Reset default roles to registry defaults}';

    protected $description = 'Synchronise roles and permissions from app/Modules/*/Permissions.php into the database';

    public function handle(RbacSync $sync): int
    {
        $result = $sync->sync((bool) $this->option('reset'));
        $this->info(sprintf('Permissions synced. New permissions: %d, new roles: %d.', $result['permissions'], $result['roles']));

        return self::SUCCESS;
    }
}
