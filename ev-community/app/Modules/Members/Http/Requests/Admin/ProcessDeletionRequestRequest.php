<?php

namespace App\Modules\Members\Http\Requests\Admin;

use App\Modules\Members\Models\AccountDeletionRequest;
use Illuminate\Foundation\Http\FormRequest;

/** Completing (anonymising) or rejecting a deletion request: both are sensitive and need a reason. */
class ProcessDeletionRequestRequest extends FormRequest
{
    public function authorize(): bool
    {
        $request = $this->route('deletionRequest');

        return $request instanceof AccountDeletionRequest && (bool) $this->user()?->can('process', $request);
    }

    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:5', 'max:1000'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return ['reason.required' => __('core.errors.reason_required'), 'reason.min' => __('core.errors.reason_required')];
    }

    public function attributes(): array
    {
        return ['reason' => __('core.labels.reason'), 'notes' => __('core.labels.notes')];
    }
}
