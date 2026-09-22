<?php

namespace App\Modules\Vehicles\Http\Requests;

use App\Modules\Vehicles\Models\Enums\Compatibility;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CompatibilityMatrixRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('vehicles.manage_master') ?? false;
    }

    public function rules(): array
    {
        return [
            'rules' => ['required', 'array', 'max:400'],
            'rules.*.vehicle_connector_type_id' => ['required', 'integer', Rule::exists('connector_types', 'id')],
            'rules.*.station_connector_type_id' => ['required', 'integer', Rule::exists('connector_types', 'id')],
            'rules.*.compatibility' => ['required', Rule::enum(Compatibility::class)],
            'rules.*.adapter_name' => ['nullable', 'string', 'max:120'],
            'rules.*.notes' => ['nullable', 'string', 'max:500'],
        ];
    }
}
