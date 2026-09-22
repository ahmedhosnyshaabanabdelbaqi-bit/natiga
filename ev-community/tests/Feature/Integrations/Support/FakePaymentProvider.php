<?php

namespace Tests\Feature\Integrations\Support;

use App\Modules\Integrations\Contracts\Data\HealthResult;
use App\Modules\Integrations\Contracts\Data\PaymentIntent;
use App\Modules\Integrations\Contracts\Data\TransactionResult;
use App\Modules\Integrations\Contracts\Data\TransactionState;
use App\Modules\Integrations\Contracts\Data\TransactionStatus;
use App\Modules\Integrations\Contracts\Data\WebhookEventData;
use App\Modules\Integrations\Contracts\Data\WebhookIdentity;
use App\Modules\Integrations\Contracts\PaymentProvider;
use Illuminate\Http\Request;

/**
 * Test-only gateway: HMAC-SHA256 of the raw body with a shared secret in the X-Signature header.
 * Registered through `Integrations::extend('payment', 'fake', ...)` exactly like a vendor driver would be.
 */
final class FakePaymentProvider implements PaymentProvider
{
    public const SECRET = 'test-webhook-secret';

    public function key(): string
    {
        return 'payment';
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
        return HealthResult::operational('fake gateway');
    }

    public function createTransaction(PaymentIntent $intent): TransactionResult
    {
        return new TransactionResult('fake_'.$intent->reference, TransactionState::Pending, 'https://gateway.test/pay/'.$intent->reference);
    }

    public function verifyTransaction(string $providerRef): TransactionStatus
    {
        return new TransactionStatus($providerRef, TransactionState::Paid);
    }

    public function verifyWebhookSignature(Request $request): bool
    {
        $expected = hash_hmac('sha256', (string) $request->getContent(), self::SECRET);

        return hash_equals($expected, (string) $request->header('X-Signature', ''));
    }

    public function webhookIdentity(Request $request): WebhookIdentity
    {
        $data = json_decode((string) $request->getContent(), true) ?: [];

        return new WebhookIdentity(isset($data['id']) ? (string) $data['id'] : null, isset($data['type']) ? (string) $data['type'] : null);
    }

    public function parseWebhook(Request $request): WebhookEventData
    {
        $data = json_decode((string) $request->getContent(), true) ?: [];

        return new WebhookEventData(
            externalEventId: $data['id'] ?? null,
            eventType: $data['type'] ?? null,
            providerRef: $data['transaction'] ?? null,
            reference: $data['reference'] ?? null,
            state: TransactionState::tryFrom((string) ($data['status'] ?? '')) ?? TransactionState::Unknown,
            amount: isset($data['amount']) ? (string) $data['amount'] : null,
            currency: $data['currency'] ?? null,
            data: $data,
        );
    }

    public static function sign(string $raw): string
    {
        return hash_hmac('sha256', $raw, self::SECRET);
    }
}
