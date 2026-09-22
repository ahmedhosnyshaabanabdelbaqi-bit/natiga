<?php

namespace App\Modules\Integrations\Contracts\Data;

final readonly class SendResult
{
    /** @param  array<string, mixed>  $raw */
    public function __construct(
        public SendStatus $status,
        public ?string $providerMessageId = null,
        public ?string $error = null,
        public array $raw = [],
    ) {}

    public static function logged(string $reference): self
    {
        return new self(SendStatus::Logged, 'log:'.$reference);
    }

    public static function failed(string $error): self
    {
        return new self(SendStatus::Failed, null, $error);
    }
}
