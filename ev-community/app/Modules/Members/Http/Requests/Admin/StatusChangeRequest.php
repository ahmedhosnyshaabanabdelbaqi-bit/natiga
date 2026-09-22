<?php

namespace App\Modules\Members\Http\Requests\Admin;

use App\Modules\Members\Models\Membership;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Shared by every status action. The policy ability is derived from the controller method and the
 * reason is mandatory for suspend/reject (the action enforces it again server-side).
 */
class StatusChangeRequest extends FormRequest
{
    private const ABILITIES = ['approve' => 'approve', 'reject' => 'reject', 'reopen' => 'reopen', 'suspend' => 'suspend', 'reactivate' => 'reactivate', 'expire' => 'expire'];

    public function authorize(): bool
    {
        $membership = $this->route('membership');
        $ability = self::ABILITIES[$this->route()?->getActionMethod() ?? ''] ?? null;

        return $ability !== null && $membership instanceof Membership && (bool) $this->user()?->can($ability, $membership);
    }

    public function rules(): array
    {
        return ['reason' => [$this->requiresReason() ? 'required' : 'nullable', 'string', 'min:5', 'max:1000']];
    }

    public function requiresReason(): bool
    {
        return in_array($this->route()?->getActionMethod(), ['suspend', 'reject'], true);
    }

    public function messages(): array
    {
        return ['reason.required' => __('core.errors.reason_required'), 'reason.min' => __('core.errors.reason_required')];
    }

    public function attributes(): array
    {
        return ['reason' => __('core.labels.reason')];
    }
}
