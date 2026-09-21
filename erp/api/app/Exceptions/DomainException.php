<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;

/**
 * A business-rule violation. Carries a stable machine code so the web app and
 * the mobile app can react without parsing Arabic text, plus a message that is
 * safe to show a user.
 */
class DomainException extends \RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly array $context = [],
        public readonly int $status = 422,
    ) {
        parent::__construct($message);
    }

    public static function make(string $code, string $message, array $context = [], int $status = 422): self
    {
        return new self($code, $message, $context, $status);
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'error' => $this->errorCode,
            'message' => $this->getMessage(),
            'context' => $this->context,
        ], $this->status);
    }
}
