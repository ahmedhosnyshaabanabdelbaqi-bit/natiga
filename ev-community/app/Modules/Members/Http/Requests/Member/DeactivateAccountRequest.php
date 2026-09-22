<?php

namespace App\Modules\Members\Http\Requests\Member;

use Illuminate\Foundation\Http\FormRequest;

class DeactivateAccountRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string', 'current_password:web'],
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function attributes(): array
    {
        return ['current_password' => __('auth.fields.password'), 'reason' => __('core.labels.reason')];
    }
}
