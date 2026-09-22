<?php

namespace Database\Factories\Members;

use App\Models\User;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Membership;
use App\Support\Sequence\NumberSequence;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\DB;

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

    public function rejected(): static
    {
        return $this->state(fn () => ['status' => MembershipStatus::Rejected, 'approved_at' => null]);
    }

    public function expired(): static
    {
        return $this->state(fn () => ['status' => MembershipStatus::Expired, 'expires_at' => now()->subDay()]);
    }

    /** Attaches a governorate (the given id, or the first active one; seeded on the fly when the table is empty). */
    public function withGovernorate(?int $governorateId = null): static
    {
        return $this->state(function () use ($governorateId) {
            $id = $governorateId ?? DB::table('governorates')->where('is_active', true)->orderBy('sort_order')->value('id');
            if ($id === null) {
                DB::table('countries')->updateOrInsert(['code' => 'EG'], ['name_ar' => 'مصر', 'name_en' => 'Egypt', 'dial_code' => '+20', 'is_active' => true]);
                DB::table('governorates')->updateOrInsert(['code' => 'CAI'], ['country_code' => 'EG', 'name_ar' => 'القاهرة', 'name_en' => 'Cairo', 'latitude' => 30.0444, 'longitude' => 31.2357, 'sort_order' => 1, 'is_active' => true]);
                $id = DB::table('governorates')->where('code', 'CAI')->value('id');
            }

            return ['governorate_id' => $id];
        });
    }

    public function referredBy(Membership $referrer): static
    {
        return $this->state(fn () => ['referred_by' => $referrer->id]);
    }
}
