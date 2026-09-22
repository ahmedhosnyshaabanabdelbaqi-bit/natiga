<?php

namespace App\Modules\Members\Models;

use App\Models\User;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Support\Concerns\HasPublicId;
use Database\Factories\Members\MembershipFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * @property int $id
 * @property string $public_id
 * @property int $user_id
 * @property string $member_number
 * @property MembershipStatus $status
 * @property string $referral_code
 * @property string $verification_token
 * @property-read User $user
 */
class Membership extends Model
{
    /** @use HasFactory<MembershipFactory> */
    use HasFactory, HasPublicId;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'status' => MembershipStatus::class,
            'joined_at' => 'datetime',
            'approved_at' => 'datetime',
            'suspended_at' => 'datetime',
            'expires_at' => 'datetime',
            'verification_token_rotated_at' => 'datetime',
        ];
    }

    protected static function newFactory(): MembershipFactory
    {
        return MembershipFactory::new();
    }

    protected static function booted(): void
    {
        static::creating(function (Membership $membership) {
            $membership->referral_code ??= self::generateReferralCode();
            $membership->verification_token ??= Str::random(48);
            $membership->verification_token_rotated_at ??= now();
        });
    }

    public static function generateReferralCode(): string
    {
        do {
            $code = 'EV'.strtoupper(Str::random(6));
        } while (self::query()->where('referral_code', $code)->exists());

        return $code;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function statusHistory(): HasMany
    {
        return $this->hasMany(MembershipStatusHistory::class)->orderByDesc('id');
    }

    public function referrer(): BelongsTo
    {
        return $this->belongsTo(self::class, 'referred_by');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', MembershipStatus::Active->value);
    }

    public function isActive(): bool
    {
        return $this->status === MembershipStatus::Active;
    }

    public function rotateVerificationToken(): void
    {
        $this->forceFill(['verification_token' => Str::random(48), 'verification_token_rotated_at' => now()])->save();
    }
}
