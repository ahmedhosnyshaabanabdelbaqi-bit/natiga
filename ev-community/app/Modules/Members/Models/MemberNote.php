<?php

namespace App\Modules\Members\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $membership_id
 * @property int|null $author_id
 * @property string $body
 * @property bool $is_pinned
 */
class MemberNote extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'member_notes';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['is_pinned' => 'boolean', 'created_at' => 'datetime'];
    }

    public function membership(): BelongsTo
    {
        return $this->belongsTo(Membership::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }
}
