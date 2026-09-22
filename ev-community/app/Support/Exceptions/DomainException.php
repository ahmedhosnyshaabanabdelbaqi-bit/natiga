<?php

namespace App\Support\Exceptions;

use RuntimeException;

/**
 * A business-rule violation. The message is a translation key (optionally with params).
 * The exception handler turns it into a validation error (Inertia) or a 422 JSON response (API).
 */
class DomainException extends RuntimeException
{
    /**
     * @param  array<string, mixed>  $params
     */
    public function __construct(
        public readonly string $key,
        public readonly array $params = [],
        public readonly ?string $field = null,
        public readonly int $status = 422,
    ) {
        parent::__construct(__($key, $params));
    }

    public static function because(string $key, array $params = [], ?string $field = null): static
    {
        return new static($key, $params, $field);
    }

    public static function conflict(string $key, array $params = []): static
    {
        return new static($key, $params, null, 409);
    }

    public static function forbidden(string $key = 'core.errors.forbidden', array $params = []): static
    {
        return new static($key, $params, null, 403);
    }
}
