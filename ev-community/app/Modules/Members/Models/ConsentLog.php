<?php

namespace App\Modules\Members\Models;

use App\Models\User;
use App\Modules\Members\Models\Enums\ConsentType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only consent trail (core table `consent_logs`). The current state of a consent type is
 * the latest row for (user, type): accepted when withdrawn_at is null and accepted_at is set.
 *
 * @property int $id
 * @property int $user_id
 * @property ConsentType $consent_type
 */
class ConsentLog extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'consent_logs';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'consent_type' => ConsentType::class,
            'accepted_at' => 'datetime',
            'withdrawn_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isGranted(): bool
    {
        return $this->accepted_at !== null && $this->withdrawn_at === null;
    }
}
