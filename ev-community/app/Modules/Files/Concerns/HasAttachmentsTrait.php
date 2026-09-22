<?php

namespace App\Modules\Files\Concerns;

use App\Modules\Files\Models\Attachment;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * Relations for models implementing App\Modules\Files\Contracts\HasAttachments.
 *
 *   $order->attachments()                     all files of the order
 *   $order->attachmentsIn('payment_proof')    files of one collection
 */
trait HasAttachmentsTrait
{
    public function attachments(): MorphMany
    {
        return $this->morphMany(Attachment::class, 'owner', 'owner_type', 'owner_id')->orderBy('id');
    }

    public function attachmentsIn(string $collection): MorphMany
    {
        return $this->attachments()->where('collection', $collection);
    }

    public function firstAttachmentIn(string $collection): ?Attachment
    {
        return $this->attachmentsIn($collection)->first();
    }
}
