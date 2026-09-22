<?php

namespace Database\Factories\Members;

use App\Models\User;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Membership;
use App\Support\Sequence\NumberSequence;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Membership>
 */
class MembershipFactory extends Factory
{
    protected $model = Membership::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'member_number' => fn () => NumberSequence::next('member'),
            'status' => MembershipStatus::Active,
            'joined_at' => now(),
            'approved_at' => now(),
            'referral_source' => fake()->randomElement(['facebook', 'friend', 'whatsapp_group', 'search']),
        ];
    }

    public function pending(): static
    {
        return $this->state(fn () => ['status' => MembershipStatus::Pending, 'approved_at' => null]);
    }

    public function suspended(): static
    {
        return $this->state(fn () => ['status' => MembershipStatus::Suspended, 'suspended_at' => now()]);
    }
}
