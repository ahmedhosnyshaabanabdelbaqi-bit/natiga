<?php

namespace App\Modules\Reports\Operations\Models;

use App\Models\User;
use App\Modules\Reports\Operations\Models\Enums\ExceptionSeverity;
use App\Modules\Reports\Operations\Models\Enums\IncidentStatus;
use App\Support\Concerns\HasPublicId;
use Database\Factories\Reports\IncidentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $public_id
 * @property string $number
 * @property ExceptionSeverity $severity
 * @property string $title
 * @property string|null $affected_module
 * @property string|null $impact
 * @property IncidentStatus $status
 * @property \Carbon\CarbonImmutable $started_at
 * @property \Carbon\CarbonImmutable $detected_at
 * @property \Carbon\CarbonImmutable|null $resolved_at
 * @property int|null $owner_id
 * @property string|null $root_cause
 * @property string|null $resolution
 * @property string|null $corrective_actions
 * @property array|null $review
 */
class Incident extends Model
{
    /** @use HasFactory<IncidentFactory> */
    use HasFactory, HasPublicId;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'severity' => ExceptionSeverity::class,
            'status' => IncidentStatus::class,
            'review' => 'array',
            'started_at' => 'datetime',
            'detected_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    protected static function newFactory(): IncidentFactory
    {
        return IncidentFactory::new();
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function events(): HasMany
    {
        return $this->hasMany(IncidentEvent::class)->orderBy('id');
    }
}
