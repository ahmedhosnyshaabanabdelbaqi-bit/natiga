<?php

namespace App\Modules\Notifications\Policies;

use App\Models\User;
use App\Modules\Notifications\Models\EmailTemplate;

class EmailTemplatePolicy
{
    /** notifications.view may read the template list; editing needs notifications.manage. */
    public function viewAny(User $user): bool
    {
        return $user->can('notifications.view') || $user->can('notifications.manage');
    }

    public function update(User $user, ?EmailTemplate $template = null): bool
    {
        return $user->can('notifications.manage');
    }
}
