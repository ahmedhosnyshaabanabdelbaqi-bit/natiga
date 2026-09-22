<?php

namespace App\Modules\Integrations\Models;

use App\Modules\Integrations\Models\Enums\WebhookEventStatus;
use Database\Factories\Integrations\WebhookEventFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * Inbound provider callback, stored idempotently (unique provider + fingerprint) before processing.
 *
 * @property int $id
 * @property string $provider
 * @property ?string $event_type
 * @property ?string $external_event_id
 * @property string $fingerprint
 * @property ?array $headers
 * @property ?array $payload
 * @property ?bool $signature_valid
 * @property WebhookEventStatus $status
 * @property int $retry_count
 * @property ?string $error
 */
class WebhookEvent extends Model
{
    /** @use HasFactory<WebhookEventFactory> */
    use HasFactory;

    public $timestamps = false;

    protected $table = 'webhook_events';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'headers' => 'array',
            'payload' => 'array',
            'signature_valid' => 'bool',
            'status' => WebhookEventStatus::class,
            'retry_count' => 'int',
            'received_at' => 'datetime',
            'processed_at' => 'datetime',
        ];
    }

    protected static function newFactory(): WebhookEventFactory
    {
        return WebhookEventFactory::new();
    }

    public function scopeForProvider(Builder $query, string $provider): Builder
    {
        return $query->where('provider', $provider);
    }

    public function scopeWithStatus(Builder $query, WebhookEventStatus|string $status): Builder
    {
        return $query->where('status', $status instanceof WebhookEventStatus ? $status->value : $status);
    }

    /**
     * Rebuild a Request from the stored payload so handlers can reuse `$provider->parseWebhook()`.
     * Sensitive headers were redacted at storage time; the signature was already verified.
     */
    public function asRequest(): Request
    {
        $payload = $this->payload ?? [];
        $request = Request::create('/webhooks/'.$this->provider, 'POST', [], [], [], ['CONTENT_TYPE' => 'application/json'], json_encode($payload, JSON_UNESCAPED_UNICODE));
        $request->headers->add(array_map(fn ($v) => (string) $v, $this->headers ?? []));

        return $request;
    }
}
