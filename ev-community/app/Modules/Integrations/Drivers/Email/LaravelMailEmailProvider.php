<?php

namespace App\Modules\Integrations\Drivers\Email;

use App\Modules\Integrations\Contracts\Data\HealthResult;
use App\Modules\Integrations\Contracts\Data\SendResult;
use App\Modules\Integrations\Contracts\Data\SendStatus;
use App\Modules\Integrations\Contracts\EmailProvider;
use App\Modules\Integrations\Exceptions\IntegrationNotConfiguredException;
use App\Modules\Integrations\Mail\IntegrationTestMail;
use App\Modules\Integrations\Services\IntegrationCall;
use App\Modules\Integrations\Support\Sanitizer;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Wraps the framework mailer. "Configured" means MAIL_MAILER points at a real transport with the
 * settings it needs — `log` and `array` never count. Tests can force the configured state with
 * `config(['ev.integrations.email.force_configured' => true])`.
 */
final class LaravelMailEmailProvider implements EmailProvider
{
    private const NOT_REAL_TRANSPORTS = ['log', 'array'];

    public function key(): string
    {
        return 'email';
    }

    public function driver(): string
    {
        return (string) config('mail.default', 'log');
    }

    public function isConfigured(): bool
    {
        if (config('ev.integrations.email.force_configured') === true) {
            return true;
        }

        return $this->mailerConfigured($this->driver());
    }

    public function healthCheck(): HealthResult
    {
        $mailer = $this->driver();
        if (! $this->isConfigured()) {
            return HealthResult::notConfigured(__('integrations.email.not_configured_hint', ['mailer' => $mailer]), ['mailer' => $mailer]);
        }
        if (config('ev.integrations.email.force_configured') === true) {
            return HealthResult::operational(__('integrations.email.forced_configured'), ['mailer' => $mailer]);
        }
        $transport = (string) config("mail.mailers.{$mailer}.transport", $mailer);
        if ($transport === 'smtp') {
            $host = (string) config("mail.mailers.{$mailer}.host");
            $port = (int) config("mail.mailers.{$mailer}.port");
            $error = null;
            $socket = @fsockopen($host, $port, $errno, $error, 3.0);
            if ($socket === false) {
                return HealthResult::degraded(__('integrations.email.smtp_unreachable', ['host' => $host, 'port' => $port]), ['mailer' => $mailer, 'error' => Sanitizer::error($error)]);
            }
            fclose($socket);

            return HealthResult::operational(__('integrations.email.smtp_reachable', ['host' => $host, 'port' => $port]), ['mailer' => $mailer]);
        }

        return HealthResult::operational(__('integrations.email.transport_configured', ['transport' => $transport]), ['mailer' => $mailer, 'transport' => $transport]);
    }

    public function sendTest(string $toEmail): SendResult
    {
        if (! $this->isConfigured()) {
            throw IntegrationNotConfiguredException::for('email');
        }
        $mailer = $this->driver();
        try {
            IntegrationCall::run('email', 'send_test', function () use ($toEmail, $mailer) {
                Mail::to($toEmail)->send(new IntegrationTestMail(requestedBy: $toEmail, mailer: $mailer));

                return true;
            }, reference: 'test:'.hash('sha256', strtolower($toEmail)), meta: ['mailer' => $mailer]);

            return new SendResult(SendStatus::Sent, null, null, ['mailer' => $mailer]);
        } catch (Throwable $e) {
            return SendResult::failed(Sanitizer::error($e->getMessage()) ?? class_basename($e));
        }
    }

    private function mailerConfigured(string $mailer, int $depth = 0): bool
    {
        if ($depth > 3 || $mailer === '' || in_array($mailer, self::NOT_REAL_TRANSPORTS, true)) {
            return false;
        }
        $config = config("mail.mailers.{$mailer}");
        if (! is_array($config)) {
            return false;
        }
        $transport = (string) ($config['transport'] ?? $mailer);

        return match ($transport) {
            'log', 'array' => false,
            'smtp' => $this->smtpConfigured($config),
            'sendmail' => filled($config['path'] ?? null),
            'ses', 'ses-v2' => filled(config('services.ses.key')) && filled(config('services.ses.secret')),
            'postmark' => filled(config('services.postmark.token')) || filled(config('services.postmark.key')),
            'resend' => filled(config('services.resend.key')),
            'mailgun' => filled(config('services.mailgun.secret')) && filled(config('services.mailgun.domain')),
            'failover', 'roundrobin' => collect($config['mailers'] ?? [])->contains(fn ($child) => $this->mailerConfigured((string) $child, $depth + 1)),
            default => false,
        };
    }

    private function smtpConfigured(array $config): bool
    {
        if (filled($config['url'] ?? null)) {
            return true;
        }
        $host = trim((string) ($config['host'] ?? ''));
        $port = (int) ($config['port'] ?? 0);
        if ($host === '' || $port <= 0) {
            return false;
        }

        // A relay on localhost without credentials is fine for development; production requires authentication.
        return filled($config['username'] ?? null) || ! app()->isProduction();
    }
}
