<?php

namespace App\Modules\Integrations\Contracts;

use App\Modules\Integrations\Contracts\Data\SendResult;
use App\Modules\Integrations\Contracts\Data\WhatsAppTemplateMessage;

interface WhatsAppProvider extends Integration
{
    public function sendTemplate(WhatsAppTemplateMessage $message): SendResult;
}
