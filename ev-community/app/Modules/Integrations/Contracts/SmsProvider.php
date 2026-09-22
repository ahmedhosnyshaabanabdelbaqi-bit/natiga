<?php

namespace App\Modules\Integrations\Contracts;

use App\Modules\Integrations\Contracts\Data\SendResult;
use App\Modules\Integrations\Contracts\Data\SmsMessage;

interface SmsProvider extends Integration
{
    public function send(SmsMessage $message): SendResult;
}
