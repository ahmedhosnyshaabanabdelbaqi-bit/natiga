<?php

namespace Tests\Feature\Notifications\Support;

use App\Modules\Integrations\Contracts\Data\HealthResult;
use App\Modules\Integrations\Contracts\Data\SendResult;
use App\Modules\Integrations\Contracts\Data\SendStatus;
use App\Modules\Integrations\Contracts\Data\SmsMessage;
use App\Modules\Integrations\Contracts\SmsProvider;

/** Test-only SMS driver registered through `Integrations::extend('sms', 'fake', ...)`. */
final class FakeSmsProvider implements SmsProvider
{
    /** @var SmsMessage[] */
    public static array $sent = [];

    public static ?string $failWith = null;

    public function key(): string
    {
        return 'sms';
    }

    public function driver(): string
    {
        return 'fake';
    }

    public function isConfigured(): bool
    {
        return true;
    }

    public function healthCheck(): HealthResult
    {
        return HealthResult::operational('fake');
    }

    public function send(SmsMessage $message): SendResult
    {
        if (self::$failWith !== null) {
            return SendResult::failed(self::$failWith);
        }
        self::$sent[] = $message;

        return new SendResult(SendStatus::Sent, 'fake-'.count(self::$sent));
    }
}
