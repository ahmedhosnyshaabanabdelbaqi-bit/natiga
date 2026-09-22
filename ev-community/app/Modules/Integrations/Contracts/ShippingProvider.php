<?php

namespace App\Modules\Integrations\Contracts;

use App\Modules\Integrations\Contracts\Data\TrackingEventData;
use App\Modules\Integrations\Contracts\Data\TrackingResult;
use Illuminate\Http\Request;

interface ShippingProvider extends Integration, ReceivesWebhooks
{
    /** Null when the carrier has no data (or the driver is manual: staff enter tracking events). */
    public function track(string $trackingNumber): ?TrackingResult;

    public function supportsWebhooks(): bool;

    /** @return array<int, TrackingEventData> */
    public function parseWebhook(Request $request): array;
}
