<?php

namespace App\Modules\Reports\Operations\Models;

use App\Models\User;
use App\Modules\Reports\Operations\Models\Enums\ExceptionCategory;
use App\Modules\Reports\Operations\Models\Enums\ExceptionSeverity;
use App\Modules\Reports\Operations\Models\Enums\ExceptionStatus;
use App\Support\Concerns\HasPublicId;
use Database\Factories\Reports\OperationsExceptionFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property string $public_id
 * @property ExceptionCategory $category
 * @property ExceptionSeverity $severity
 * @property string $title
 * @property array|null $details
 * @property string|null $source
 * @property string|null $dedup_key
 * @property ExceptionStatus $status
 * @property int|null $assigned_to
 * @property \Carbon\CarbonImmutable $detected_at
 * @property \Carbon\CarbonImmutable|null $resolved_at
 * @property int|null $resolved_by
 * @property string|null $resolution
 * @property int $occurrences
 */
class OperationsException extends Model
{
    /** @use HasFactory<OperationsExceptionFactory> */
    use HasFactory, HasPublicId;

    protected $table = 'operations_exceptions';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'category' => ExceptionCategory::class,
            'severity' => ExceptionSeverity::class,
            'status' => ExceptionStatus::class,
            'details' => 'array',
            'detected_at' => 'datetime',
            'resolved_at' => 'datetime',
            'occurrences' => 'int',
        ];
    }

    protected static function newFactory(): OperationsExceptionFactory
    {
        return OperationsExceptionFactory::new();
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    public function scopeLive(Builder $query): Builder
    {
        return $query->whereIn('status', ExceptionStatus::LIVE);
    }
}
