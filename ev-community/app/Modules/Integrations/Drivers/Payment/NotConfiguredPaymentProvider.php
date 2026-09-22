<?php

namespace App\Modules\Integrations\Drivers\Payment;

use App\Modules\Integrations\Contracts\Data\PaymentIntent;
use App\Modules\Integrations\Contracts\Data\TransactionResult;
use App\Modules\Integrations\Contracts\Data\TransactionStatus;
use App\Modules\Integrations\Contracts\Data\WebhookEventData;
use App\Modules\Integrations\Contracts\Data\WebhookIdentity;
use App\Modules\Integrations\Contracts\PaymentProvider;
use App\Modules\Integrations\Drivers\Concerns\NotConfiguredDriver;
use Illuminate\Http\Request;

final class NotConfiguredPaymentProvider implements PaymentProvider
{
    use NotConfiguredDriver;

    public function key(): string
    {
        return 'payment';
    }

    public function createTransaction(PaymentIntent $intent): TransactionResult
    {
        throw $this->notConfigured();
    }

    public function verifyTransaction(string $providerRef): TransactionStatus
    {
        throw $this->notConfigured();
    }

    public function verifyWebhookSignature(Request $request): bool
    {
        return false;
    }

    public function webhookIdentity(Request $request): WebhookIdentity
    {
        throw $this->notConfigured();
    }

    public function parseWebhook(Request $request): WebhookEventData
    {
        throw $this->notConfigured();
    }
}
