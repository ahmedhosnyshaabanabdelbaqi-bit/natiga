<?php

namespace Database\Factories\Notifications;

use App\Models\User;
use App\Modules\Notifications\Models\AnnouncementCampaign;
use App\Modules\Notifications\Models\Enums\CampaignStatus;
use App\Modules\Notifications\Services\AnnouncementAudiences;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AnnouncementCampaign>
 */
class AnnouncementCampaignFactory extends Factory
{
    protected $model = AnnouncementCampaign::class;

    public function definition(): array
    {
        return [
            'title_ar' => 'إعلان '.fake()->words(2, true),
            'title_en' => 'Announcement '.fake()->words(2, true),
            'body_ar' => fake()->sentence(10),
            'body_en' => fake()->sentence(10),
            'url' => null,
            'category' => 'system',
            'audience_type' => AnnouncementAudiences::ALL_MEMBERS,
            'audience_params' => [],
            'channels' => ['in_app'],
            'is_marketing' => false,
            'status' => CampaignStatus::Draft,
            'created_by' => User::factory(),
        ];
    }

    public function scheduled(?\DateTimeInterface $at = null): static
    {
        return $this->state(fn () => ['status' => CampaignStatus::Scheduled, 'scheduled_at' => $at ?? now()->subMinute()]);
    }

    public function marketing(): static
    {
        return $this->state(fn () => ['is_marketing' => true, 'category' => 'offers']);
    }

    public function withChannels(array $channels): static
    {
        return $this->state(fn () => ['channels' => $channels]);
    }
}
