<?php

namespace App\Modules\Integrations\Contracts;

use App\Modules\Integrations\Contracts\Data\PaymentIntent;
use App\Modules\Integrations\Contracts\Data\TransactionResult;
use App\Modules\Integrations\Contracts\Data\TransactionStatus;
use App\Modules\Integrations\Contracts\Data\WebhookEventData;
use Illuminate\Http\Request;

interface PaymentProvider extends Integration, ReceivesWebhooks
{
    /** Non-idempotent financial call: never retried automatically. */
    public function createTransaction(PaymentIntent $intent): TransactionResult;

    /** Idempotent read of the gateway's own view of a transaction. */
    public function verifyTransaction(string $providerRef): TransactionStatus;

    public function parseWebhook(Request $request): WebhookEventData;
}
