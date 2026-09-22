<?php

namespace App\Modules\Members\Http\Requests\Member;

use Illuminate\Foundation\Http\FormRequest;

class DeletionRequestRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'reason' => ['nullable', 'string', 'max:1000'],
            'acknowledge' => ['accepted'],
        ];
    }

    public function attributes(): array
    {
        return ['reason' => __('core.labels.reason'), 'acknowledge' => __('privacy.deletion.acknowledge_label')];
    }
}
