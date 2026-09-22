<?php

namespace App\Modules\System\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class BannerRequest extends FormRequest
{
    public const LEVELS = ['information', 'warning', 'major'];

    public const TARGETS = ['public', 'member', 'partner'];

    public function authorize(): bool
    {
        return $this->user()?->can('banners.manage') ?? false;
    }

    public function rules(): array
    {
        return [
            'level' => ['required', Rule::in(self::LEVELS)],
            'message_ar' => ['required', 'string', 'max:255'],
            'message_en' => ['required', 'string', 'max:255'],
            'targets' => ['required', 'array', 'min:1'],
            'targets.*' => [Rule::in(self::TARGETS)],
            'is_active' => ['required', 'boolean'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
        ];
    }

    public function attributes(): array
    {
        return ['level' => __('system.banners.fields.level'), 'message_ar' => __('system.banners.fields.message_ar'), 'message_en' => __('system.banners.fields.message_en'), 'targets' => __('system.banners.fields.targets'), 'is_active' => __('system.banners.fields.is_active'), 'starts_at' => __('system.banners.fields.starts_at'), 'ends_at' => __('system.banners.fields.ends_at')];
    }
}
