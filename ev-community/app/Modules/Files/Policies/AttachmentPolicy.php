<?php

namespace App\Modules\Files\Policies;

use App\Models\User;
use App\Modules\Files\Contracts\HasAttachments;
use App\Modules\Files\Models\Attachment;

/**
 * Who may read/delete a stored file:
 *  - the uploader,
 *  - anyone the owning model authorizes through HasAttachments::attachmentViewableBy(),
 *  - staff holding `files.manage`.
 * Super roles pass via Gate::before.
 */
class AttachmentPolicy
{
    public function view(User $user, Attachment $attachment): bool
    {
        if ($attachment->uploaded_by !== null && $attachment->uploaded_by === $user->id) {
            return true;
        }

        if ($user->can('files.manage')) {
            return true;
        }

        $owner = $attachment->owner_id ? $attachment->owner : null;
        if ($owner instanceof HasAttachments) {
            return $owner->attachmentViewableBy($user, $attachment);
        }

        return false;
    }

    public function delete(User $user, Attachment $attachment): bool
    {
        if ($user->can('files.manage')) {
            return true;
        }

        // Uploaders may remove their own files only while the file is not yet attached to a record.
        return $attachment->isPending() && $attachment->uploaded_by === $user->id;
    }
}
