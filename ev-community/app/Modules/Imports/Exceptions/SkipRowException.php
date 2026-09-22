<?php

namespace App\Modules\Imports\Exceptions;

use RuntimeException;

/**
 * Thrown from Importer::importRow() to leave a row out on purpose (status `skipped`),
 * e.g. "already up to date" or "not applicable". The message is shown in the error report.
 */
class SkipRowException extends RuntimeException
{
    public static function because(string $translationKey, array $params = []): static
    {
        return new static(__($translationKey, $params));
    }
}
