<?php

namespace App\Modules\Integrations\Contracts;

use App\Modules\Integrations\Contracts\Data\HealthResult;

/**
 * Base contract every integration driver implements. Business modules only ever depend on the
 * category contracts (PaymentProvider, MapProvider, ...) resolved through `Integrations::<category>()`.
 */
interface Integration
{
    /** Category key: payment|map|email|sms|whatsapp|shipping|charging|exchange_rate. */
    public function key(): string;

    /** Driver name as configured (none|osm|manual|log|smtp|paymob...). */
    public function driver(): string;

    /** True only when the driver has everything it needs to do real work (credentials, endpoints...). */
    public function isConfigured(): bool;

    /** Bounded (timeouts!) health probe. Must never throw; must never report operational without evidence. */
    public function healthCheck(): HealthResult;
}
