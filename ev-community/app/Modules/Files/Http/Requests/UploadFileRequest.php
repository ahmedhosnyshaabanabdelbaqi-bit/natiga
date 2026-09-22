<?php

namespace App\Modules\Files\Http\Requests;

use App\Modules\Files\Rules\SafeUpload;
use App\Modules\Files\Services\AttachmentService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UploadFileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'kind' => ['nullable', 'string', Rule::in(AttachmentService::KINDS)],
            'file' => ['required', 'file', new SafeUpload($this->kind())],
        ];
    }

    public function kind(): string
    {
        $kind = (string) $this->input('kind', 'image');

        return in_array($kind, AttachmentService::KINDS, true) ? $kind : 'image';
    }
}
