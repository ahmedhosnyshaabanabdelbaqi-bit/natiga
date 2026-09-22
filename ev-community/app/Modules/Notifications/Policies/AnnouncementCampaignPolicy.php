<?php

namespace App\Modules\Notifications\Policies;

use App\Models\User;
use App\Modules\Notifications\Models\AnnouncementCampaign;

/**
 * Permission gate for campaigns. State rules (only drafts are deletable, only draft/scheduled are editable, ...) are
 * enforced by AnnouncementService with translated 422 errors, so the policy only answers "may this user act at all".
 */
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
        return $user->can('notifications.manage');
    }

    public function send(User $user, AnnouncementCampaign $campaign): bool
    {
        return $user->can('notifications.manage');
    }

    public function cancel(User $user, AnnouncementCampaign $campaign): bool
    {
        return $user->can('notifications.manage');
    }

    public function delete(User $user, AnnouncementCampaign $campaign): bool
    {
        return $user->can('notifications.manage');
    }
}
