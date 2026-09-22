<?php

namespace Tests\Feature\Notifications\Support;

use App\Modules\Integrations\Contracts\Data\HealthResult;
use App\Modules\Integrations\Contracts\Data\SendResult;
use App\Modules\Integrations\Contracts\Data\SendStatus;
use App\Modules\Integrations\Contracts\Data\WhatsAppTemplateMessage;
use App\Modules\Integrations\Contracts\WhatsAppProvider;

/** Test-only WhatsApp driver registered through `Integrations::extend('whatsapp', 'fake', ...)`. */
final class FakeWhatsAppProvider implements WhatsAppProvider
{
    /** @var WhatsAppTemplateMessage[] */
    public static array $sent = [];

    public function key(): string
    {
        return 'whatsapp';
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

    public function sendTemplate(WhatsAppTemplateMessage $message): SendResult
    {
        self::$sent[] = $message;

        return new SendResult(SendStatus::Queued, 'wa-'.count(self::$sent));
    }
}
