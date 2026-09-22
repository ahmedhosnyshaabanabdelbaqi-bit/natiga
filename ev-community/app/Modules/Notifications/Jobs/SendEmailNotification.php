<?php

namespace App\Modules\Notifications\Jobs;

use App\Models\User;
use App\Modules\Notifications\Mail\NotificationMail;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\Notifications\Services\Channels\EmailChannel;
use App\Modules\Notifications\Services\NotificationService;
use Illuminate\Support\Facades\Mail;

/** Sends one email delivery (bilingual NotificationMail in the recipient's locale). */
class SendEmailNotification extends DeliveryJob
{
    protected function deliver(NotificationDelivery $delivery, Notification $notification, User $user, NotificationService $service): void
    {
        $locale = $user->preferredLocale();
        Mail::to($user->email, $user->name)->send(new NotificationMail($notification, $user, $locale));
        $delivery->markSent(EmailChannel::driver());
    }

    protected function missingAddressReason(): string
    {
        return NotificationDelivery::SKIP_NO_EMAIL;
    }
}
