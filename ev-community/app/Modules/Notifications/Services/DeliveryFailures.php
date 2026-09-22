<?php

namespace App\Modules\Notifications\Services;

use App\Modules\Notifications\Models\Enums\DeliveryStatus;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\Reports\Operations\Services\OperationsExceptions;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Final failure of a delivery job: the delivery becomes `failed` (with the error) and an operations exception is
 * raised in the Exception Center (category `notifications`, one open exception per channel whose occurrences grow),
 * so staff can fix the provider and retry from /admin/notifications/deliveries.
 */
final class DeliveryFailures
{
    public static function record(int $deliveryId, ?Throwable $exception): void
    {
        $delivery = NotificationDelivery::query()->with('notification:id,public_id,key')->find($deliveryId);
        if ($delivery === null || $delivery->status !== DeliveryStatus::Queued) {
            return;
        }
        $error = self::clean($exception?->getMessage() ?? 'failed');
        $delivery->markFailed($error);
        self::raise($delivery, $error);
    }

    public static function clean(string $message): string
    {
        // Provider errors may echo recipients; keep them short and never log full payloads.
        $message = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $message) ?? $message;

        return mb_substr(trim($message) !== '' ? trim($message) : 'failed', 0, 2000);
    }

    private static function raise(NotificationDelivery $delivery, string $error): void
    {
        if (! class_exists(OperationsExceptions::class)) {
            return;
        }
        try {
            app(OperationsExceptions::class)->raise(
                'notifications',
                'p2',
                __('notifications.ops.delivery_failed', ['channel' => $delivery->channel->label()]),
                [
                    'channel' => $delivery->channel->value,
                    'notification' => $delivery->notification?->public_id,
                    'key' => $delivery->notification?->key,
                    'error' => mb_substr($error, 0, 300),
                    'retry_url' => '/admin/notifications/deliveries?status=failed&channel='.$delivery->channel->value,
                ],
                dedupKey: 'notifications:delivery_failed:'.$delivery->channel->value,
                source: 'notifications:deliveries',
            );
        } catch (Throwable $e) {
            Log::warning('notifications.ops_exception_failed', ['delivery' => $delivery->id, 'error' => $e->getMessage()]);
        }
    }
}
