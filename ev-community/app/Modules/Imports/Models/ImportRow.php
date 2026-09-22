<?php

namespace App\Modules\Imports\Models;

use App\Modules\Imports\Models\Enums\ImportRowStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $import_id
 * @property int $row_number
 * @property array<string, string|null> $raw
 * @property array<string, mixed>|null $normalized
 * @property ImportRowStatus $status
 * @property array<int|string, string>|null $errors
 * @property string|null $entity_type
 * @property int|null $entity_id
 * @property Carbon|null $processed_at
 */
class ImportRow extends Model
{
    public $timestamps = false;

    protected $table = 'import_rows';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'raw' => 'array',
            'normalized' => 'array',
            'errors' => 'array',
            'status' => ImportRowStatus::class,
            'row_number' => 'int',
            'processed_at' => 'datetime',
        ];
    }

    public function import(): BelongsTo
    {
        return $this->belongsTo(Import::class);
    }
}
