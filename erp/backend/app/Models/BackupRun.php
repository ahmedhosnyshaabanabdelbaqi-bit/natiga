<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;


class BackupRun extends Model
{
    protected $table = 'backup_runs';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'is_encrypted' => 'boolean',
            'offsite_copied' => 'boolean',
            'restore_tested_at' => 'datetime',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }
}
