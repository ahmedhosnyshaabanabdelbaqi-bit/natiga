<?php

namespace App\Modules\Vehicles\Services;

use App\Models\User;
use App\Modules\Files\Models\Attachment;
use App\Modules\Files\Services\AttachmentService;
use App\Modules\Vehicles\Models\MemberVehicle;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

/**
 * Stores/removes the vehicle photo through the Files module (private disk, authorized download,
 * MIME sniffing and size limits from settings). One photo per vehicle.
 */
final class VehicleImageStore
{
    public function __construct(private AttachmentService $attachments) {}

    /** Sets image_attachment_id on a persisted vehicle (caller saves). Replaces any previous photo. */
    public function attach(UploadedFile $file, MemberVehicle $vehicle, ?User $uploader = null): Attachment
    {
        $this->detach($vehicle);
        $attachment = $this->attachments->store($file, $vehicle, MemberVehicle::IMAGE_COLLECTION, Attachment::VISIBILITY_PRIVATE, 'image', $uploader);
        $vehicle->image_attachment_id = $attachment->id;
        $vehicle->image_path = null;

        return $attachment;
    }

    /**
     * Unlinks the current photo (caller saves). The attachment row and its files are removed only
     * after the surrounding transaction commits, so a rollback never leaves a vehicle pointing at a
     * deleted file.
     */
    public function detach(MemberVehicle $vehicle): void
    {
        if ($vehicle->image_attachment_id) {
            $attachmentId = $vehicle->image_attachment_id;
            DB::afterCommit(function () use ($attachmentId) {
                $attachment = Attachment::query()->find($attachmentId);
                if ($attachment) {
                    $this->attachments->delete($attachment);
                }
            });
            $vehicle->image_attachment_id = null;
        }
        $vehicle->image_path = null;
    }
}
