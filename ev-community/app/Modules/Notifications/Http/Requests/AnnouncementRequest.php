<?php

namespace App\Modules\Notifications\Http\Requests;

use App\Modules\Notifications\Models\AnnouncementCampaign;
use App\Modules\Notifications\Models\Enums\NotificationCategory;
use App\Modules\Notifications\Models\Enums\NotificationChannel;
use App\Modules\Notifications\Services\AnnouncementAudiences;
use App\Modules\Notifications\Support\NotificationUrl;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Create / update an announcement campaign (bilingual text, link, category, channels, audience). */
class AnnouncementRequest extends FormRequest
{
    public function authorize(): bool
    {
        $campaign = $this->route('campaign');

        return $campaign instanceof AnnouncementCampaign
            ? $this->user()?->can('update', $campaign) ?? false
            : $this->user()?->can('create', AnnouncementCampaign::class) ?? false;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $type = (string) $this->input('audience_type', '');

        return [
            'title_ar' => ['required', 'string', 'max:255'],
            'title_en' => ['required', 'string', 'max:255'],
            'body_ar' => ['required', 'string', 'max:5000'],
            'body_en' => ['required', 'string', 'max:5000'],
            'url' => ['nullable', 'string', 'max:2048', function (string $attribute, mixed $value, Closure $fail): void {
                if ($value !== null && $value !== '' && ! NotificationUrl::isValid($value)) {
                    $fail(__('notifications.errors.invalid_url'));
                }
            }],
            'category' => ['required', Rule::in(NotificationCategory::values())],
            'is_marketing' => ['boolean'],
            'channels' => ['array'],
            'channels.*' => ['string', Rule::in(NotificationChannel::values())],
            'audience_type' => ['required', 'string', Rule::in(AnnouncementAudiences::keys())],
            'audience_params' => ['nullable', 'array'],
            ...(AnnouncementAudiences::has($type) ? AnnouncementAudiences::rulesFor($type) : []),
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        $type = (string) $this->input('audience_type', '');

        return [
            'title_ar' => __('notifications.admin.fields.title_ar'),
            'title_en' => __('notifications.admin.fields.title_en'),
            'body_ar' => __('notifications.admin.fields.body_ar'),
            'body_en' => __('notifications.admin.fields.body_en'),
            'url' => __('notifications.admin.fields.url'),
            'category' => __('notifications.admin.fields.category'),
            'channels' => __('notifications.admin.fields.channels'),
            'audience_type' => __('notifications.admin.fields.audience_type'),
            ...(AnnouncementAudiences::has($type) ? AnnouncementAudiences::attributesFor($type) : []),
        ];
    }
}
