<?php

namespace App\Modules\Notifications\Http\Requests;

use App\Modules\Notifications\Models\AnnouncementCampaign;
use App\Modules\Notifications\Services\AnnouncementAudiences;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Server-side recipient estimate for an audience (the count only; recipients are never listed). */
class EstimateAudienceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', AnnouncementCampaign::class) ?? false;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $type = (string) $this->input('audience_type', '');

        return [
            'audience_type' => ['required', 'string', Rule::in(AnnouncementAudiences::keys())],
            'audience_params' => ['nullable', 'array'],
            ...(AnnouncementAudiences::has($type) ? AnnouncementAudiences::rulesFor($type) : []),
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        $type = (string) $this->input('audience_type', '');

        return ['audience_type' => __('notifications.admin.fields.audience_type'), ...(AnnouncementAudiences::has($type) ? AnnouncementAudiences::attributesFor($type) : [])];
    }
}
