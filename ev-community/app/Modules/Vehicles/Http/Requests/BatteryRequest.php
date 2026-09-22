<?php

namespace App\Modules\Vehicles\Http\Requests;

use App\Modules\Vehicles\Models\BatteryVariant;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class BatteryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('vehicles.manage_master') ?? false;
    }

    public function rules(): array
    {
        $battery = $this->route('battery');

        return [
            'name' => ['required', 'string', 'max:120', Rule::unique('battery_variants', 'name')->ignore($battery instanceof BatteryVariant ? $battery->id : null)],
            'capacity_kwh' => ['required', 'numeric', 'min:1', 'max:500'],
            'chemistry' => ['nullable', 'string', Rule::in(BatteryVariant::CHEMISTRIES)],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }
}
