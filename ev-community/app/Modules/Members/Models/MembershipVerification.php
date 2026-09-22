<?php

namespace App\Modules\Members\Models;

use App\Models\User;
use App\Modules\Members\Models\Enums\VerificationPurpose;
use App\Modules\Members\Models\Enums\VerificationResult;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * @property int $id
 * @property int $membership_id
 * @property VerificationPurpose $purpose
 * @property VerificationResult $result
 */
class MembershipVerification extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'membership_verifications';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'purpose' => VerificationPurpose::class,
            'result' => VerificationResult::class,
            'created_at' => 'datetime',
        ];
    }

    public function membership(): BelongsTo
    {
        return $this->belongsTo(Membership::class);
    }

    public function verifiedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }

    public function context(): MorphTo
    {
        return $this->morphTo('context', 'context_type', 'context_id');
    }
}
