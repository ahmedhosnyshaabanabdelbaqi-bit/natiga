<?php

namespace App\Domain\Shared;

use RuntimeException;

/**
 * خطأ قاعدة عمل — يُترجم إلى رسالة عربية واضحة للمستخدم ورمز خطأ ثابت للـ API.
 */
class DomainException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly array $context = [],
    ) {
        parent::__construct($message);
    }

    public static function make(string $code, string $message, array $context = []): self
    {
        return new self($code, $message, $context);
    }
}
