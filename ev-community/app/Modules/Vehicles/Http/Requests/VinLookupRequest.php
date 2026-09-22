<?php

namespace App\Modules\Vehicles\Http\Requests;

use App\Modules\Vehicles\Models\MemberVehicle;
use Illuminate\Foundation\Http\FormRequest;

class VinLookupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('vehicles.view') ?? false;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['vin' => MemberVehicle::normalizeVin(is_string($this->input('vin')) ? $this->input('vin') : null)]);
    }

    public function rules(): array
    {
        return ['vin' => ['required', 'string', 'regex:'.MemberVehicle::VIN_PATTERN]];
    }

    public function messages(): array
    {
        return ['vin.regex' => __('vehicles.errors.vin_invalid')];
    }
}
