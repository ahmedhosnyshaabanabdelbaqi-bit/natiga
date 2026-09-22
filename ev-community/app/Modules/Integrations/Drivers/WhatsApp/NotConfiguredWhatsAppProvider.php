<?php

namespace App\Modules\Integrations\Drivers\WhatsApp;

use App\Modules\Integrations\Contracts\Data\SendResult;
use App\Modules\Integrations\Contracts\Data\WhatsAppTemplateMessage;
use App\Modules\Integrations\Contracts\WhatsAppProvider;
use App\Modules\Integrations\Drivers\Concerns\NotConfiguredDriver;

final class NotConfiguredWhatsAppProvider implements WhatsAppProvider
{
    use NotConfiguredDriver;

    public function key(): string
    {
        return 'whatsapp';
    }

    public function sendTemplate(WhatsAppTemplateMessage $message): SendResult
    {
        throw $this->notConfigured();
    }
}
