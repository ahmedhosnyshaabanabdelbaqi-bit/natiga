<?php

namespace App\Modules\Integrations\Contracts\Data;

final readonly class WhatsAppTemplateMessage
{
    /** @param  array<int|string, string>  $parameters  template placeholders in order */
    public function __construct(
        public string $to,
        public string $template,
        public array $parameters = [],
        public string $locale = 'ar',
        public ?string $reference = null,
    ) {}
}
