<?php

namespace App\Modules\Vehicles\Services;

use App\Modules\Vehicles\Models\MemberVehicle;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Stores/removes the vehicle photo. Uses the Files module AttachmentService when available,
 * otherwise falls back to the public disk (`image_path`).
 *
 * integration: switch to AttachmentService only, and drop the `image_path` fallback.
 */
final class VehicleImageStore
{
    public const ATTACHMENT_SERVICE = 'App\\Modules\\Files\\Services\\AttachmentService';

    public const COLLECTION = 'vehicle_image';

    /** Sets image_attachment_id / image_path on the model (caller saves). */
    public function attach(UploadedFile $file, MemberVehicle $vehicle): void
    {
        $this->detach($vehicle);

        if (class_exists(self::ATTACHMENT_SERVICE)) {
            $attachment = app(self::ATTACHMENT_SERVICE)->store($file, $vehicle, self::COLLECTION, 'private', 'image');
            $vehicle->image_attachment_id = $attachment->id;
            $vehicle->image_path = null;

            return;
        }

        // integration: switch to AttachmentService
        $extension = strtolower($file->extension() ?: $file->getClientOriginalExtension() ?: 'jpg');
        $path = $file->storeAs('vehicles', Str::lower((string) Str::ulid()).'.'.$extension, ['disk' => 'public']);
        $vehicle->image_path = $path ?: null;
        $vehicle->image_attachment_id = null;
    }

    public function detach(MemberVehicle $vehicle): void
    {
        if ($vehicle->image_path) {
            Storage::disk('public')->delete($vehicle->image_path);
            $vehicle->image_path = null;
        }
        if ($vehicle->image_attachment_id) {
            $model = 'App\\Modules\\Files\\Models\\Attachment';
            if (class_exists($model)) {
                $model::query()->whereKey($vehicle->image_attachment_id)->first()?->delete();
            }
            $vehicle->image_attachment_id = null;
        }
    }
}
