<?php

namespace App\Modules\Notifications\Mail;

use App\Models\User;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Services\EmailTemplateRenderer;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Notifications\Support\NotificationUrl;
use App\Modules\System\Services\Settings;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Bilingual, branded email for one notification (RTL layout for Arabic, plain-text alternative).
 * Subject/body come from EmailTemplateRenderer (admin overrides → lang defaults → stored notification text);
 * variables are always escaped.
 *
 * Note: `Mailable` already declares `$locale`, so the recipient locale is kept in `$mailLocale` and applied
 * through `$this->locale()`.
 */
class NotificationMail extends Mailable
{
    /** @var array{subject: string, html: string, text: string, customized: bool}|null */
    private ?array $rendered = null;

    public function __construct(public readonly Notification $notification, public readonly User $recipient, public readonly string $mailLocale)
    {
        $this->locale($mailLocale);
    }

    public function envelope(): Envelope
    {
        $fromName = Settings::localized('notifications.email_from_name', $this->mailLocale) ?: Settings::localized('branding.site_name', $this->mailLocale, config('app.name'));

        return new Envelope(
            from: new Address((string) config('mail.from.address'), (string) $fromName),
            subject: $this->subjectLine(),
        );
    }

    public function content(): Content
    {
        $rendered = $this->rendered();

        return new Content(
            view: 'mail.notification',
            text: 'mail.notification-text',
            with: [
                'locale' => $this->mailLocale,
                'dir' => ev_dir($this->mailLocale),
                'siteName' => (string) Settings::localized('branding.site_name', $this->mailLocale, config('app.name')),
                'primaryColor' => $this->color('branding.primary_color', '#0B1220'),
                'accentColor' => $this->color('branding.accent_color', '#0F766E'),
                'backgroundColor' => $this->color('branding.background_color', '#F8FAFC'),
                'logoUrl' => $this->logoUrl(),
                'subject' => $this->subjectLine(),
                'bodyHtml' => $rendered['html'],
                'bodyText' => $rendered['text'],
                'greeting' => __('notifications.mail.greeting', ['name' => $this->recipient->name], $this->mailLocale),
                'actionUrl' => $this->notification->url ? NotificationUrl::absolute($this->notification->url) : null,
                'preferencesUrl' => rtrim((string) config('app.url'), '/').'/account/notification-preferences',
                'isMarketing' => ! $this->notification->is_transactional,
                'year' => now()->year,
            ],
        );
    }

    /** @return array{subject: string, html: string, text: string, customized: bool} */
    public function rendered(): array
    {
        if ($this->rendered === null) {
            $this->rendered = app(EmailTemplateRenderer::class)->render(
                $this->notification->key,
                $this->mailLocale,
                app(NotificationService::class)->variablesFor($this->notification, $this->recipient, $this->mailLocale),
            );
        }

        return $this->rendered;
    }

    private function subjectLine(): string
    {
        $subject = $this->rendered()['subject'];

        return $subject !== '' ? $subject : $this->notification->title;
    }

    /** Only plain hex colors reach the inline CSS (settings are admin-editable). */
    private function color(string $key, string $default): string
    {
        $value = Settings::get($key, $default);

        return is_string($value) && preg_match('/^#[0-9A-Fa-f]{3,8}$/', $value) ? $value : $default;
    }

    private function logoUrl(): ?string
    {
        $path = Settings::get('branding.logo_path');
        if (! is_string($path) || $path === '') {
            return null;
        }
        if (preg_match('#^https://#i', $path)) {
            return $path;
        }

        return rtrim((string) config('app.url'), '/').'/'.ltrim($path, '/');
    }
}
