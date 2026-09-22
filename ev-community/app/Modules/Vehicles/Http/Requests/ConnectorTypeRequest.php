<?php

namespace App\Modules\Vehicles\Http\Requests;

use App\Modules\Vehicles\Models\ConnectorType;
use App\Modules\Vehicles\Models\Enums\CurrentType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ConnectorTypeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('vehicles.manage_master') ?? false;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('code'))) {
            $this->merge(['code' => strtolower(trim($this->input('code')))]);
        }
    }

    public function rules(): array
    {
        $connector = $this->route('connector');

        return [
            'code' => ['required', 'string', 'max:30', 'regex:/^[a-z][a-z0-9_]*$/', Rule::unique('connector_types', 'code')->ignore($connector instanceof ConnectorType ? $connector->id : null)],
            'name_ar' => ['required', 'string', 'max:120'],
            'name_en' => ['required', 'string', 'max:120'],
            'current_type' => ['required', Rule::enum(CurrentType::class)],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:-1000', 'max:1000'],
        ];
    }
}
