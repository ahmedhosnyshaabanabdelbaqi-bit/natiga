<?php

namespace App\Modules\Notifications\Mail;

use App\Models\User;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Services\EmailTemplateRenderer;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\System\Services\Settings;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Bilingual, branded email for one notification. Subject/body come from EmailTemplateRenderer
 * (admin overrides → lang defaults → stored notification text); variables are always escaped.
 */
class NotificationMail extends Mailable
{
    /** @var array{subject: string, html: string, text: string, customized: bool}|null */
    private ?array $rendered = null;

    public function __construct(public readonly Notification $notification, public readonly User $user, public readonly string $locale) {}

    public function envelope(): Envelope
    {
        $fromName = Settings::localized('notifications.email_from_name', $this->locale) ?: Settings::localized('branding.site_name', $this->locale, config('app.name'));

        return new Envelope(
            from: new Address((string) config('mail.from.address'), (string) $fromName),
            subject: $this->rendered()['subject'] !== '' ? $this->rendered()['subject'] : $this->notification->title,
        );
    }

    public function content(): Content
    {
        $rendered = $this->rendered();
        $service = app(NotificationService::class);

        return new Content(
            view: 'mail.notification',
            text: 'mail.notification-text',
            with: [
                'locale' => $this->locale,
                'dir' => ev_dir($this->locale),
                'siteName' => Settings::localized('branding.site_name', $this->locale, config('app.name')),
                'primaryColor' => (string) Settings::get('branding.primary_color', '#0B1220'),
                'accentColor' => (string) Settings::get('branding.accent_color', '#0F766E'),
                'backgroundColor' => (string) Settings::get('branding.background_color', '#F8FAFC'),
                'logoUrl' => $this->logoUrl(),
                'subject' => $rendered['subject'] !== '' ? $rendered['subject'] : $this->notification->title,
                'bodyHtml' => $rendered['html'],
                'bodyText' => $rendered['text'],
                'greeting' => __('notifications.mail.greeting', ['name' => $this->user->name], $this->locale),
                'actionUrl' => $this->notification->url ? $service->absoluteUrl($this->notification->url) : null,
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
            $service = app(NotificationService::class);
            $this->rendered = app(EmailTemplateRenderer::class)->render(
                $this->notification->key,
                $this->locale,
                $service->variablesFor($this->notification, $this->user, $this->locale),
            );
        }

        return $this->rendered;
    }

    private function logoUrl(): ?string
    {
        $path = Settings::get('branding.logo_path');
        if (! is_string($path) || $path === '') {
            return null;
        }

        return str_starts_with($path, 'http') ? $path : rtrim((string) config('app.url'), '/').'/'.ltrim($path, '/');
    }
}
