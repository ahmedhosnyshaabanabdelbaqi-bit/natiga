<?php

namespace App\Modules\Notifications\Policies;

use App\Models\User;
use App\Modules\Notifications\Models\AnnouncementCampaign;

class AnnouncementCampaignPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('notifications.view') || $user->can('notifications.manage');
    }

    public function view(User $user, AnnouncementCampaign $campaign): bool
    {
        return $this->viewAny($user);
    }

    public function create(User $user): bool
    {
        return $user->can('notifications.manage');
    }

    public function update(User $user, AnnouncementCampaign $campaign): bool
    {
        return $user->can('notifications.manage') && $campaign->status->isEditable();
    }

    public function send(User $user, AnnouncementCampaign $campaign): bool
    {
        return $user->can('notifications.manage');
    }

    public function cancel(User $user, AnnouncementCampaign $campaign): bool
    {
        return $user->can('notifications.manage') && $campaign->status->isCancellable();
    }

    public function delete(User $user, AnnouncementCampaign $campaign): bool
    {
        return $user->can('notifications.manage');
    }
}
