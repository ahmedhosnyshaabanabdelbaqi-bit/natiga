<?php

namespace App\Modules\Imports\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class UpdateImportMappingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('imports.manage') ?? false;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'mapping' => ['present', 'array'],
            'mapping.*' => ['nullable', 'integer', 'min:0', 'max:1000'],
        ];
    }

    /** @return array<string, int|null> */
    public function mapping(): array
    {
        $mapping = [];
        foreach ((array) $this->validated('mapping', []) as $key => $index) {
            if (is_string($key)) {
                $mapping[$key] = $index === null ? null : (int) $index;
            }
        }

        return $mapping;
    }
}
