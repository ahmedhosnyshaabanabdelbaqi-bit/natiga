<?php

declare(strict_types=1);

namespace App\Support\Exceptions;

use RuntimeException;

/**
 * Base class for every business-rule violation raised by a domain service.
 *
 * Domain exceptions are rendered as structured JSON (see bootstrap/app.php) so
 * the POS client can react to a specific `error_code` instead of parsing text.
 */
class DomainException extends RuntimeException
{
    /** @param array<string,mixed> $context */
    public function __construct(
        string $message,
        protected string $errorCode = 'domain_error',
        protected int $status = 422,
        protected array $context = [],
    ) {
        parent::__construct($message);
    }

    /** @param array<string,mixed> $context */
    public static function make(string $message, string $errorCode, int $status = 422, array $context = []): static
    {
        return new static($message, $errorCode, $status, $context);
    }

    public function errorCode(): string
    {
        return $this->errorCode;
    }

    public function statusCode(): int
    {
        return $this->status;
    }

    /** @return array<string,mixed> */
    public function context(): array
    {
        return $this->context;
    }
}
