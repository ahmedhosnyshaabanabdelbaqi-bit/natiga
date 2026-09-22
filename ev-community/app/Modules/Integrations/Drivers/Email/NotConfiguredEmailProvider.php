<?php

namespace App\Modules\Integrations\Drivers\Email;

use App\Modules\Integrations\Contracts\Data\SendResult;
use App\Modules\Integrations\Contracts\EmailProvider;
use App\Modules\Integrations\Drivers\Concerns\NotConfiguredDriver;

final class NotConfiguredEmailProvider implements EmailProvider
{
    use NotConfiguredDriver;

    public function key(): string
    {
        return 'email';
    }

    public function sendTest(string $toEmail): SendResult
    {
        throw $this->notConfigured();
    }
}
