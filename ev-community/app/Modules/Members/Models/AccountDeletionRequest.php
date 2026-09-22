<?php

namespace App\Modules\Members\Models;

use App\Models\User;
use App\Modules\Members\Models\Enums\DeletionRequestStatus;
use App\Support\Concerns\HasPublicId;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property string $public_id
 * @property int $user_id
 * @property DeletionRequestStatus $status
 * @property string|null $reason
 * @property-read User $user
 */
class AccountDeletionRequest extends Model
{
    use HasPublicId;

    protected $table = 'account_deletion_requests';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'status' => DeletionRequestStatus::class,
            'requested_at' => 'datetime',
            'processed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function processedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'processed_by');
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', [DeletionRequestStatus::Requested->value, DeletionRequestStatus::UnderReview->value]);
    }

    public function isOpen(): bool
    {
        return $this->status->isOpen();
    }
}
