<?php

namespace App\Modules\Reports\Operations\Policies;

use App\Models\User;
use App\Modules\Reports\Operations\Models\OperationsException;

class OperationsExceptionPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->checkPermissionTo('operations.view') || $user->checkPermissionTo('operations.manage');
    }

    public function assign(User $user, OperationsException $exception): bool
    {
        return $user->checkPermissionTo('operations.manage');
    }

    public function resolve(User $user, OperationsException $exception): bool
    {
        return $user->checkPermissionTo('operations.manage');
    }

    public function ignore(User $user, OperationsException $exception): bool
    {
        return $user->checkPermissionTo('operations.manage');
    }
}
