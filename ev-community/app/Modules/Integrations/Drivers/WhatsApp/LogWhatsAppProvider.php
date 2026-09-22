<?php

namespace App\Modules\Integrations\Drivers\WhatsApp;

use App\Modules\Integrations\Contracts\Data\HealthResult;
use App\Modules\Integrations\Contracts\Data\SendResult;
use App\Modules\Integrations\Contracts\Data\WhatsAppTemplateMessage;
use App\Modules\Integrations\Contracts\WhatsAppProvider;
use App\Modules\Integrations\Drivers\Sms\LogSmsProvider;
use App\Modules\Integrations\Services\IntegrationCall;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/** Development driver (log only, non-production). See LogSmsProvider. */
final class LogWhatsAppProvider implements WhatsAppProvider
{
    public function key(): string
    {
        return 'whatsapp';
    }

    public function driver(): string
    {
        return 'log';
    }

    public function isConfigured(): bool
    {
        return ! app()->isProduction();
    }

    public function healthCheck(): HealthResult
    {
        if (app()->isProduction()) {
            return HealthResult::notConfigured(__('integrations.errors.log_driver_production'));
        }

        return HealthResult::degraded(__('integrations.health.log_driver_detail'), ['driver' => 'log']);
    }

    public function sendTemplate(WhatsAppTemplateMessage $message): SendResult
    {
        $reference = $message->reference ?? (string) Str::ulid();

        return IntegrationCall::run('whatsapp', 'send_template', function () use ($message, $reference) {
            Log::channel(config('logging.default'))->info('integrations.whatsapp.logged', [
                'to' => LogSmsProvider::maskMobile($message->to),
                'template' => $message->template,
                'parameters' => $message->parameters,
                'locale' => $message->locale,
                'reference' => $reference,
            ]);

            return SendResult::logged($reference);
        }, reference: $reference, meta: ['driver' => 'log', 'template' => $message->template]);
    }
}
