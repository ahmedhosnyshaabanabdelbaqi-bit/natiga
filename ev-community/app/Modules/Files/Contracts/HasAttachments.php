<?php

namespace App\Modules\Files\Contracts;

use App\Models\User;
use App\Modules\Files\Models\Attachment;

/**
 * Implemented by every model that owns attachments. The download route asks the owner
 * whether the current user may see a given file; the owner decides based on its own
 * ownership rules (member owns the order, staff has the permission, center user ...).
 *
 * Pair with App\Modules\Files\Concerns\HasAttachmentsTrait for the relations.
 */
interface HasAttachments
{
    public function attachmentViewableBy(User $user, Attachment $attachment): bool;
}
