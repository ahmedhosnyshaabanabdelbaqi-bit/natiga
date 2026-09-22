<?php

namespace App\Http\Requests\Settings;

use App\Concerns\PasswordValidationRules;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class PasswordUpdateRequest extends FormRequest
{
    use PasswordValidationRules;

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'current_password' => $this->currentPasswordRules(),
            'password' => $this->passwordRules(),
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return [
            'current_password' => __('settings.security.current_password'),
            'password' => __('settings.security.new_password'),
            'password_confirmation' => __('settings.security.confirm_password'),
        ];
    }
}
