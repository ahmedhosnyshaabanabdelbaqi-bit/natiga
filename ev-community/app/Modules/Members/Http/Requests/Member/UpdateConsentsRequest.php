<?php

namespace App\Modules\Members\Http\Requests\Member;

use App\Modules\Members\Models\Enums\ConsentType;
use Illuminate\Foundation\Http\FormRequest;

class UpdateConsentsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $rules = [];
        foreach (ConsentType::marketing() as $type) {
            $rules[$type->value] = ['sometimes', 'boolean'];
        }

        return $rules;
    }

    /** @return array<string, bool> */
    public function wanted(): array
    {
        return array_map(fn ($v) => filter_var($v, FILTER_VALIDATE_BOOL), $this->validated());
    }
}
