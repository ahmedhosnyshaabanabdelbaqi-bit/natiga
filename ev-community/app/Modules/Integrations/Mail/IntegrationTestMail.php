<?php

namespace App\Modules\Integrations\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** Plain test message sent by the admin "Send test email to me" button. */
class IntegrationTestMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly string $requestedBy, public readonly string $transportName)
    {
        //
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: __('integrations.email.test_subject', ['app' => config('app.name')]));
    }

    public function content(): Content
    {
        $body = e(__('integrations.email.test_body', ['app' => config('app.name'), 'mailer' => $this->transportName, 'user' => $this->requestedBy, 'time' => now()->timezone(config('ev.timezone', 'Africa/Cairo'))->format('Y-m-d H:i')]));

        return new Content(htmlString: '<p dir="auto">'.$body.'</p>');
    }
}
