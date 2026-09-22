<?php

namespace App\Modules\Integrations\Drivers\Shipping;

use App\Modules\Integrations\Contracts\Data\TrackingResult;
use App\Modules\Integrations\Contracts\Data\WebhookIdentity;
use App\Modules\Integrations\Contracts\ShippingProvider;
use App\Modules\Integrations\Drivers\Concerns\NotConfiguredDriver;
use Illuminate\Http\Request;

final class NotConfiguredShippingProvider implements ShippingProvider
{
    use NotConfiguredDriver;

    public function key(): string
    {
        return 'shipping';
    }

    public function track(string $trackingNumber): ?TrackingResult
    {
        throw $this->notConfigured();
    }

    public function supportsWebhooks(): bool
    {
        return false;
    }

    public function verifyWebhookSignature(Request $request): bool
    {
        return false;
    }

    public function webhookIdentity(Request $request): WebhookIdentity
    {
        throw $this->notConfigured();
    }

    public function parseWebhook(Request $request): array
    {
        throw $this->notConfigured();
    }
}
