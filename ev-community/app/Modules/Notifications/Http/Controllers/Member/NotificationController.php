<?php

namespace App\Modules\Notifications\Http\Controllers\Member;

use App\Modules\Notifications\Http\Controllers\Concerns\NotificationCenterController;

/** `/account/notifications`: the member's own notification center. */
class NotificationController extends NotificationCenterController
{
    protected function component(): string
    {
        return 'member/notifications/index';
    }

    protected function preferencesUrl(): ?string
    {
        return route('member.notification-preferences.edit', absolute: false);
    }
}
