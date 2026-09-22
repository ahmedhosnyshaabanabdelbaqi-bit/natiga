<?php

namespace App\Modules\Integrations\Exceptions;

use RuntimeException;

/** No module registered a handler for this webhook provider. Not retryable: a deploy must fix it. */
class WebhookHandlerMissingException extends RuntimeException
{
    public function __construct(public readonly string $provider)
    {
        parent::__construct(__('integrations.errors.no_webhook_handler', ['provider' => $provider]));
    }
}
