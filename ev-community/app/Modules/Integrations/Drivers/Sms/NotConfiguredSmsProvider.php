<?php

namespace App\Modules\Integrations\Drivers\Sms;

use App\Modules\Integrations\Contracts\Data\SendResult;
use App\Modules\Integrations\Contracts\Data\SmsMessage;
use App\Modules\Integrations\Contracts\SmsProvider;
use App\Modules\Integrations\Drivers\Concerns\NotConfiguredDriver;

final class NotConfiguredSmsProvider implements SmsProvider
{
    use NotConfiguredDriver;

    public function key(): string
    {
        return 'sms';
    }

    public function send(SmsMessage $message): SendResult
    {
        throw $this->notConfigured();
    }
}
