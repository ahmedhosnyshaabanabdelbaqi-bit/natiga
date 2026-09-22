<?php

namespace App\Modules\Integrations\Contracts;

use App\Modules\Integrations\Contracts\Data\SendResult;

interface EmailProvider extends Integration
{
    /** Sends a real test message through the configured mailer (throws IntegrationNotConfiguredException otherwise). */
    public function sendTest(string $toEmail): SendResult;
}
