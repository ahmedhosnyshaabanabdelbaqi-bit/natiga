<?php

namespace App\Modules\Integrations\Contracts\Data;

final readonly class SmsMessage
{
    public function __construct(
        public string $to,                 // E.164 or local Egyptian format (01xxxxxxxxx); drivers normalise
        public string $body,
        public ?string $reference = null,  // our entity reference (notification id, OTP scope...)
        public string $locale = 'ar',
    ) {}
}
