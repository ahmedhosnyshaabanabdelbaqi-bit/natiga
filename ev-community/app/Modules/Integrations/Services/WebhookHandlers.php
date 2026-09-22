<?php

namespace App\Modules\Integrations\Services;

use App\Modules\Integrations\Exceptions\WebhookHandlerMissingException;
use App\Modules\Integrations\Models\WebhookEvent;
use Closure;
use InvalidArgumentException;

/**
 * Registry other modules use to process verified webhook events, keyed by category:
 *
 *   WebhookHandlers::register('payment', fn (WebhookEvent $event) => app(HandleGatewayWebhook::class)->execute($event));
 *   WebhookHandlers::register('shipping', TrackingWebhookHandler::class);   // invokable class
 *
 * Handlers must be idempotent (the same event may be retried) and throw to signal failure.
 */
final class WebhookHandlers
{
    /** @var array<string, array<int, Closure|string|array{0: string, 1: string}>> */
    private static array $handlers = [];

    /** @param  Closure(WebhookEvent): void|class-string|array{0: string, 1: string}  $handler */
    public static function register(string $provider, Closure|string|array $handler): void
    {
        if (is_string($handler) && ! class_exists($handler)) {
            throw new InvalidArgumentException("Webhook handler class [{$handler}] does not exist");
        }
        self::$handlers[$provider][] = $handler;
    }

    public static function has(string $provider): bool
    {
        return ! empty(self::$handlers[$provider]);
    }

    /** @return string[] */
    public static function providers(): array
    {
        return array_keys(array_filter(self::$handlers));
    }

    public static function handle(WebhookEvent $event): void
    {
        $handlers = self::$handlers[$event->provider] ?? [];
        if ($handlers === []) {
            throw new WebhookHandlerMissingException($event->provider);
        }
        foreach ($handlers as $handler) {
            if ($handler instanceof Closure) {
                $handler($event);
            } elseif (is_array($handler)) {
                app($handler[0])->{$handler[1]}($event);
            } else {
                app($handler)($event);
            }
        }
    }

    public static function reset(): void
    {
        self::$handlers = [];
    }
}
