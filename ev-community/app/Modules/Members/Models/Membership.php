<?php

namespace App\Modules\Members\Models;

use App\Models\User;
use App\Modules\Members\Actions\ChangeMembershipStatus;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Referrals\Models\MemberReferral;
use App\Support\Concerns\HasPublicId;
use Database\Factories\Members\MembershipFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;

/**
 * @property int $id
 * @property string $public_id
 * @property int $user_id
 * @property string $member_number
 * @property MembershipStatus $status
 * @property int|null $governorate_id
 * @property string $referral_code
 * @property int|null $referred_by
 * @property string|null $referral_source
 * @property string $verification_token
 * @property \Illuminate\Support\Carbon|null $joined_at
 * @property \Illuminate\Support\Carbon|null $approved_at
 * @property \Illuminate\Support\Carbon|null $suspended_at
 * @property \Illuminate\Support\Carbon|null $expires_at
 * @property-read User $user
 * @property-read Governorate|null $governorate
 */
class Membership extends Model
{
    /** @use HasFactory<MembershipFactory> */
    use HasFactory, HasPublicId;

    /** Whitelisted sort keys for admin listings (see Services\MemberDirectory). */
    public const SORTS = ['member_number', 'name', 'joined_at', 'status'];

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

    // ---- Relations -------------------------------------------------------------------------

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function governorate(): BelongsTo
    {
        return $this->belongsTo(Governorate::class);
    }

    public function statusHistory(): HasMany
    {
        return $this->hasMany(MembershipStatusHistory::class)->orderByDesc('id');
    }

    public function referrer(): BelongsTo
    {
        return $this->belongsTo(self::class, 'referred_by');
    }

    public function verifications(): HasMany
    {
        return $this->hasMany(MembershipVerification::class)->orderByDesc('id');
    }

    /**
     * Staff notes history (table member_notes). Named `memberNotes` because `notes` is also a
     * legacy text column on this table and Eloquent resolves attributes before relations.
     */
    public function memberNotes(): HasMany
    {
        return $this->hasMany(MemberNote::class)->orderByDesc('is_pinned')->orderByDesc('id');
    }

    /** Personal-data deletion requests of the owning user. */
    public function deletionRequests(): HasMany
    {
        return $this->hasMany(AccountDeletionRequest::class, 'user_id', 'user_id')->orderByDesc('id');
    }

    /** Members this membership referred (Referrals module). */
    public function referrals(): HasMany
    {
        return $this->hasMany(MemberReferral::class, 'referrer_membership_id')->orderByDesc('id');
    }

    /** The referral row through which this membership was referred, if any. */
    public function referral(): HasOne
    {
        return $this->hasOne(MemberReferral::class, 'referred_membership_id');
    }

    // ---- Scopes ----------------------------------------------------------------------------

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('memberships.status', MembershipStatus::Active->value);
    }

    public function scopeStatus(Builder $query, MembershipStatus|string|null $status): Builder
    {
        $value = $status instanceof MembershipStatus ? $status->value : $status;

        return $value ? $query->where('memberships.status', $value) : $query;
    }

    /**
     * Case-insensitive search on member number, user name, email and mobile. The term is bound
     * as a parameter and LIKE wildcards inside it are escaped, so it is never injectable.
     */
    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        $term = trim((string) $term);
        if ($term === '') {
            return $query;
        }
        $like = '%'.addcslashes(mb_substr($term, 0, 100), '%_\\').'%';

        return $query->where(function (Builder $q) use ($like) {
            $q->where('memberships.member_number', 'ILIKE', $like)
                ->orWhereHas('user', function (Builder $u) use ($like) {
                    $u->where('users.name', 'ILIKE', $like)
                        ->orWhere('users.email', 'ILIKE', $like)
                        ->orWhere('users.mobile', 'ILIKE', $like);
                });
        });
    }

    // ---- Behaviour -------------------------------------------------------------------------

    public function isActive(): bool
    {
        return $this->status === MembershipStatus::Active;
    }

    public function rotateVerificationToken(): void
    {
        $this->forceFill(['verification_token' => Str::random(48), 'verification_token_rotated_at' => now()])->save();
    }

    /**
     * Change status through the state machine (history + audit + events). Throws DomainException
     * on an invalid transition or a missing reason for suspend/reject.
     */
    public function transitionTo(MembershipStatus $to, ?User $actor, ?string $reason = null): static
    {
        app(ChangeMembershipStatus::class)->execute($this, $to, $actor, $reason);
        $this->refresh();

        return $this;
    }

    /** Member number masked for public display: EV-000123 → EV-****23. */
    public function maskedMemberNumber(): string
    {
        return self::maskMemberNumber($this->member_number);
    }

    public static function maskMemberNumber(string $number): string
    {
        $dash = strrpos($number, '-');
        $prefix = $dash === false ? '' : substr($number, 0, $dash + 1);
        $digits = $dash === false ? $number : substr($number, $dash + 1);
        $keep = min(2, strlen($digits));

        return $prefix.str_repeat('*', max(0, strlen($digits) - $keep)).substr($digits, strlen($digits) - $keep);
    }
}
