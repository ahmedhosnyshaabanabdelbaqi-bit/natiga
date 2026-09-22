<?php

namespace App\Modules\Notifications\Http\Controllers\Admin;

use App\Modules\Notifications\Http\Controllers\Concerns\NotificationCenterController;

/** `/admin/notifications/inbox`: operational notifications addressed to the signed-in staff member. */
class InboxController extends NotificationCenterController
{
    protected function component(): string
    {
        return 'admin/notifications/inbox';
    }
}
