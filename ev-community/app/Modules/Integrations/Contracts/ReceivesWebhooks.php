<?php

namespace App\Modules\Integrations\Contracts;

use App\Modules\Integrations\Contracts\Data\WebhookIdentity;
use Illuminate\Http\Request;

/**
 * Implemented by drivers that accept provider callbacks on POST /webhooks/{category}.
 */
interface ReceivesWebhooks
{
    /** Cryptographic verification of the callback (HMAC/signature header). Never return true without verifying. */
    public function verifyWebhookSignature(Request $request): bool;

    /** Provider event id + type, used for idempotent storage. May throw on malformed payloads. */
    public function webhookIdentity(Request $request): WebhookIdentity;
}
