<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SyncOperation extends BaseModel
{
    protected $table = 'sync_operations';

    public $incrementing = false;

    protected $keyType = 'string';

    /**
     * The primary key is a client-generated UUID and must be assignable — the
     * device chooses it so a retry can be recognised as the same operation.
     * BaseModel guards 'id', so it is explicitly unguarded here.
     */
    protected $guarded = [];

    public static function booted(): void
    {
        static::creating(function (self $operation) {
            $operation->id ??= (string) \Illuminate\Support\Str::uuid();
        });
    }

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'client_created_at' => 'datetime',
            'received_at' => 'datetime',
            'processed_at' => 'datetime',
        ];
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** The receipt returned to the device — the contract for a replayed request. */
    public function toReceipt(): array
    {
        return [
            'operation_id' => $this->id,
            'idempotency_key' => $this->idempotency_key,
            'status' => $this->status,
            'doc_type' => $this->server_doc_type,
            'doc_id' => $this->server_doc_id,
            'doc_code' => $this->server_doc_code,
            'error_code' => $this->error_code,
            'error_message' => $this->error_message,
            'processed_at' => $this->processed_at?->toIso8601String(),
        ];
    }
}
