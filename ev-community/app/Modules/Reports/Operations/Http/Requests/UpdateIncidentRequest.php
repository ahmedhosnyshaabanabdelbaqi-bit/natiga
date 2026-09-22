<?php

namespace App\Modules\Reports\Operations\Http\Requests;

class UpdateIncidentRequest extends StoreIncidentRequest
{
    public function rules(): array
    {
        $rules = parent::rules();
        $rules['title'] = ['sometimes', ...$rules['title']];
        $rules['severity'] = ['sometimes', ...$rules['severity']];

        return $rules;
    }
}
