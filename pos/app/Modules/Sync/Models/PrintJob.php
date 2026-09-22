<?php

declare(strict_types=1);

namespace App\Modules\Sync\Models;

use App\Modules\Core\Models\PrintTemplate;
use App\Modules\Core\Models\Terminal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 */
class PrintJob extends Model
{
    protected $table = 'print_jobs';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'is_reprint' => 'boolean',
            'printed_at' => 'datetime',
        ];
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(PrintTemplate::class, 'print_template_id');
    }

    public function terminal(): BelongsTo
    {
        return $this->belongsTo(Terminal::class, 'terminal_id');
    }
}
