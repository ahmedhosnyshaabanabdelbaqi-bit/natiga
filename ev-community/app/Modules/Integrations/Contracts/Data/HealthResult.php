<?php

namespace App\Modules\Integrations\Contracts\Data;

use Carbon\CarbonImmutable;

/**
 * Result of a driver health check. `message` is a human readable, secret-free explanation
 * (translated where possible); `meta` is sanitised diagnostic data.
 */
final readonly class HealthResult
{
    /** @param  array<string, mixed>  $meta */
    public function __construct(
        public HealthStatus $status,
        public ?string $message = null,
        public ?CarbonImmutable $checkedAt = null,
        public array $meta = [],
    ) {}

    public static function operational(?string $message = null, array $meta = []): self
    {
        return new self(HealthStatus::Operational, $message, CarbonImmutable::now(), $meta);
    }

    public static function degraded(string $message, array $meta = []): self
    {
        return new self(HealthStatus::Degraded, $message, CarbonImmutable::now(), $meta);
    }

    public static function unavailable(string $message, array $meta = []): self
    {
        return new self(HealthStatus::Unavailable, $message, CarbonImmutable::now(), $meta);
    }

    public static function notConfigured(?string $message = null, array $meta = []): self
    {
        return new self(HealthStatus::NotConfigured, $message ?? __('integrations.health.not_configured'), CarbonImmutable::now(), $meta);
    }

    public function checkedAt(): CarbonImmutable
    {
        return $this->checkedAt ?? CarbonImmutable::now();
    }

    /** @return array{status: string, message: ?string, checked_at: string, meta: array<string, mixed>} */
    public function toArray(): array
    {
        return [
            'status' => $this->status->value,
            'message' => $this->message,
            'checked_at' => $this->checkedAt()->toIso8601String(),
            'meta' => $this->meta,
        ];
    }
}
