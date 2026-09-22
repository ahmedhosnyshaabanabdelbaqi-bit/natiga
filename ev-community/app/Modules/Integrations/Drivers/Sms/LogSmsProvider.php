<?php

namespace App\Modules\Integrations\Drivers\Sms;

use App\Modules\Integrations\Contracts\Data\HealthResult;
use App\Modules\Integrations\Contracts\Data\SendResult;
use App\Modules\Integrations\Contracts\Data\SmsMessage;
use App\Modules\Integrations\Contracts\SmsProvider;
use App\Modules\Integrations\Services\IntegrationCall;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Development driver: writes the message to the application log and reports `logged`
 * (never `sent`). The manager refuses to resolve it in production.
 */
final class LogSmsProvider implements SmsProvider
{
    public function key(): string
    {
        return 'sms';
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

    public function send(SmsMessage $message): SendResult
    {
        $reference = $message->reference ?? (string) Str::ulid();

        return IntegrationCall::run('sms', 'send', function () use ($message, $reference) {
            Log::channel(config('logging.default'))->info('integrations.sms.logged', [
                'to' => self::maskMobile($message->to),
                'body' => $message->body,
                'locale' => $message->locale,
                'reference' => $reference,
            ]);

            return SendResult::logged($reference);
        }, reference: $reference, meta: ['driver' => 'log', 'to' => self::maskMobile($message->to)]);
    }

    public static function maskMobile(string $mobile): string
    {
        $digits = preg_replace('/\D+/', '', $mobile) ?? '';

        return strlen($digits) > 3 ? str_repeat('*', strlen($digits) - 3).substr($digits, -3) : '***';
    }
}
