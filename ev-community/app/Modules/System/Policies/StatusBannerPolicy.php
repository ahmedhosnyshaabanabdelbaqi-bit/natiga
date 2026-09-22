<?php

namespace App\Modules\System\Policies;

use App\Models\User;
use App\Modules\System\Models\StatusBanner;

class StatusBannerPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->checkPermissionTo('banners.manage');
    }

    public function create(User $user): bool
    {
        return $user->checkPermissionTo('banners.manage');
    }

    public function update(User $user, StatusBanner $banner): bool
    {
        return $user->checkPermissionTo('banners.manage');
    }

    public function delete(User $user, StatusBanner $banner): bool
    {
        return $user->checkPermissionTo('banners.manage');
    }
}
