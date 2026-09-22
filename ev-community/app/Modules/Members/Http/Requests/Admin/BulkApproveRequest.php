<?php

namespace App\Modules\Members\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class BulkApproveRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->can('members.approve');
    }

    public function rules(): array
    {
        return [
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['required', 'string', 'size:26', 'alpha_num:ascii'],
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }
}
