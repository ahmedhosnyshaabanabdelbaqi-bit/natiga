<?php

namespace App\Modules\Imports\Http\Requests\Admin;

use App\Modules\Files\Rules\SafeUpload;
use App\Modules\Imports\Services\Importers;
use App\Modules\Imports\Services\SpreadsheetReader;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\Rule;

class StoreImportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('imports.manage') ?? false;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'type' => ['required', 'string', Rule::in(array_keys(Importers::availableFor($this->user())))],
            'file' => [
                'bail',
                'required',
                'file',
                function (string $attribute, mixed $value, \Closure $fail) {
                    $extension = $value instanceof UploadedFile ? strtolower((string) pathinfo($value->getClientOriginalName(), PATHINFO_EXTENSION)) : '';
                    if (! in_array($extension, SpreadsheetReader::FORMATS, true)) {
                        $fail(__('imports.errors.unsupported_format', ['formats' => 'csv, xlsx']));
                    }
                },
                new SafeUpload('spreadsheet'),
            ],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'type' => __('imports.fields.type'),
            'file' => __('imports.fields.file'),
        ];
    }
}
