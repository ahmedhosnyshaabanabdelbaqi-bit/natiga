<?php

namespace Database\Factories\Vehicles;

use App\Models\User;
use App\Modules\Members\Models\Membership;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Models\VehicleMake;
use App\Modules\Vehicles\Models\VehicleModel;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<MemberVehicle> */
class MemberVehicleFactory extends Factory
{
    protected $model = MemberVehicle::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'membership_id' => fn (array $attributes) => Membership::query()->where('user_id', $attributes['user_id'])->value('id')
                ?? Membership::factory()->create(['user_id' => $attributes['user_id']])->id,
            'vehicle_make_id' => VehicleMake::factory(),
            'vehicle_model_id' => fn (array $attributes) => VehicleModel::factory()->create(['vehicle_make_id' => $attributes['vehicle_make_id']])->id,
            'vehicle_variant_id' => null,
            'year' => 2023,
            'market_version' => MarketVersion::Europe,
            'vin' => null,
            'nickname' => null,
            'status' => VehicleStatus::Active,
            'is_primary' => false,
        ];
    }

    /** Owned by an existing member user (uses the user's membership). */
    public function forMember(User $user): static
    {
        return $this->state(fn () => ['user_id' => $user->id, 'membership_id' => $user->membership?->id ?? Membership::query()->where('user_id', $user->id)->value('id')]);
    }

    public function primary(): static
    {
        return $this->state(fn () => ['is_primary' => true]);
    }

    public function archived(): static
    {
        return $this->state(fn () => ['status' => VehicleStatus::Archived, 'is_primary' => false]);
    }

    public function sold(): static
    {
        return $this->state(fn () => ['status' => VehicleStatus::Sold, 'is_primary' => false]);
    }

    public function withVin(string $vin = 'LGXCE4CB5N0123456'): static
    {
        return $this->state(fn () => ['vin' => $vin]);
    }
}
