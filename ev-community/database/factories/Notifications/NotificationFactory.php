<?php

namespace Database\Factories\Notifications;

use App\Models\User;
use App\Modules\Notifications\Models\Enums\NotificationCategory;
use App\Modules\Notifications\Models\Notification;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Notification>
 */
class NotificationFactory extends Factory
{
    protected $model = Notification::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'category' => fake()->randomElement(NotificationCategory::values()),
            'key' => 'system.generic',
            'title' => fake()->sentence(4),
            'body' => fake()->sentence(12),
            'url' => null,
            'data' => [],
            'is_transactional' => true,
            'dedup_key' => null,
            'read_at' => null,
            'created_at' => now(),
        ];
    }

    public function read(): static
    {
        return $this->state(fn () => ['read_at' => now()]);
    }

    public function marketing(): static
    {
        return $this->state(fn () => ['is_transactional' => false, 'category' => NotificationCategory::Offers->value]);
    }

    public function category(NotificationCategory|string $category): static
    {
        return $this->state(fn () => ['category' => $category instanceof NotificationCategory ? $category->value : $category]);
    }
}
