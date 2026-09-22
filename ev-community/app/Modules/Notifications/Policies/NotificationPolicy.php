<?php

namespace App\Modules\Notifications\Policies;

use App\Models\User;
use App\Modules\Notifications\Models\Notification;

/** Notifications are strictly personal: only the addressee can read or mark them (super roles are NOT exempt). */
class NotificationPolicy
{
    public function view(User $user, Notification $notification): bool
    {
        return $notification->user_id === $user->id;
    }

    public function markRead(User $user, Notification $notification): bool
    {
        return $notification->user_id === $user->id;
    }
}
