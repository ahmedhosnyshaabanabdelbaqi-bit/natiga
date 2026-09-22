<?php

namespace App\Modules\Files\Exceptions;

use App\Support\Exceptions\DomainException;

/**
 * Thrown by AttachmentService when an upload fails the safety checks
 * (empty, wrong MIME, disallowed extension, too large). Rendered as a
 * validation error on the `file` field (or the field given by the caller).
 */
class InvalidUploadException extends DomainException
{
    public static function reason(string $reason, array $params = [], string $field = 'file'): static
    {
        return new static('files.errors.'.$reason, $params, $field);
    }
}
