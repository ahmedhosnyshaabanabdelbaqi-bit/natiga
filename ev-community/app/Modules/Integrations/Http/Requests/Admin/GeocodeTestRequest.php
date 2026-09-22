<?php

namespace App\Modules\Integrations\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class GeocodeTestRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('integrations.manage') ?? false;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'address' => ['required', 'string', 'min:3', 'max:200'],
        ];
    }

    public function attributes(): array
    {
        return ['address' => __('integrations.map.address')];
    }
}
