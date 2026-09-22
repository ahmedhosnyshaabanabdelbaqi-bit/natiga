<?php

namespace App\Modules\Referrals\Models;

use App\Modules\Members\Models\Membership;
use App\Modules\Referrals\Models\Enums\ReferralStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $referrer_membership_id
 * @property int $referred_membership_id
 * @property string $referral_code_used
 * @property ReferralStatus $status
 * @property Carbon $created_at
 * @property Carbon|null $approved_at
 * @property-read Membership $referrer
 * @property-read Membership $referred
 */
class MemberReferral extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'member_referrals';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'status' => ReferralStatus::class,
            'created_at' => 'datetime',
            'approved_at' => 'datetime',
        ];
    }

    public function referrer(): BelongsTo
    {
        return $this->belongsTo(Membership::class, 'referrer_membership_id');
    }

    public function referred(): BelongsTo
    {
        return $this->belongsTo(Membership::class, 'referred_membership_id');
    }
}
