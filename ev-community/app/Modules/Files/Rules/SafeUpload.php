<?php

namespace App\Modules\Files\Rules;

use App\Modules\Files\Exceptions\InvalidUploadException;
use App\Modules\Files\Services\AttachmentService;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Http\UploadedFile;
use InvalidArgumentException;

/**
 * FormRequest rule running the exact checks AttachmentService::store() applies
 * (finfo MIME sniffing, extension whitelist, size ceilings, image sanity):
 *
 *   'photo' => ['required', new SafeUpload('image')],
 *   'proof' => ['required', new SafeUpload('document')],
 */
final class SafeUpload implements ValidationRule
{
    public function __construct(private readonly string $kind = 'document')
    {
        if (! in_array($kind, AttachmentService::KINDS, true)) {
            throw new InvalidArgumentException("Unknown upload kind [{$kind}]");
        }
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! $value instanceof UploadedFile) {
            $fail(__('files.errors.upload_failed'));

            return;
        }

        try {
            app(AttachmentService::class)->inspect($value, $this->kind);
        } catch (InvalidUploadException $e) {
            $fail($e->getMessage());
        }
    }
}
