<?php

namespace App\Modules\Notifications\Http\Controllers\Partner;

use App\Modules\Notifications\Http\Controllers\Concerns\NotificationCenterController;

/** `/partner/notifications`: the partner user's own notifications (personal, not center-wide). */
class NotificationController extends NotificationCenterController
{
    protected function component(): string
    {
        return 'partner/notifications/index';
    }
}
