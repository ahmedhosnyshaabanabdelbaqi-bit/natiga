<?php

namespace App\Modules\Integrations\Drivers\Shipping;

use App\Modules\Integrations\Contracts\Data\HealthResult;
use App\Modules\Integrations\Contracts\Data\TrackingResult;
use App\Modules\Integrations\Contracts\Data\WebhookIdentity;
use App\Modules\Integrations\Contracts\ShippingProvider;
use Illuminate\Http\Request;

/**
 * No carrier API: shipment tracking events are entered by the shipping officer. `track()` returns
 * null so callers show the manual timeline instead of pretending to have live data.
 */
final class ManualShippingProvider implements ShippingProvider
{
    public function key(): string
    {
        return 'shipping';
    }

    public function driver(): string
    {
        return 'manual';
    }

    public function isConfigured(): bool
    {
        return true;
    }

    public function healthCheck(): HealthResult
    {
        return HealthResult::operational(__('integrations.health.manual_shipping_detail'), ['driver' => 'manual']);
    }

    public function track(string $trackingNumber): ?TrackingResult
    {
        return null;
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
        return new WebhookIdentity;
    }

    public function parseWebhook(Request $request): array
    {
        return [];
    }
}
