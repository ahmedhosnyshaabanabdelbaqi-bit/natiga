<?php

namespace App\Modules\Files\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Files\Http\Requests\UploadFileRequest;
use App\Modules\Files\Models\Attachment;
use App\Modules\Files\Services\AttachmentService;
use Illuminate\Http\JsonResponse;

/**
 * POST /files/upload  (route: shared.files.upload, throttle:uploads)
 *
 * Generic pre-upload endpoint for wizards that collect files before the owning record exists.
 * The file lands in the `pending_upload` collection with no owner and must be claimed with
 * AttachmentService::moveToOwner() within 24 hours, otherwise `files:purge-orphans` removes it.
 */
class UploadController extends Controller
{
    public function __construct(private readonly AttachmentService $attachments) {}

    public function __invoke(UploadFileRequest $request): JsonResponse
    {
        $kind = $request->kind();
        $attachment = $this->attachments->store(
            $request->file('file'),
            null,
            Attachment::COLLECTION_PENDING,
            Attachment::VISIBILITY_PRIVATE,
            $kind,
            $request->user(),
        );

        return response()->json([
            'id' => $attachment->public_id,
            'name' => $attachment->original_filename,
            'size' => $attachment->size,
            'mime' => $attachment->mime_type,
            'kind' => $kind,
            'preview_url' => $attachment->isImage() && $attachment->variantPath('thumb') ? $this->attachments->downloadUrl($attachment, 'thumb') : null,
            'download_url' => $this->attachments->downloadUrl($attachment),
            'expires_at' => $attachment->created_at?->addHours(Attachment::PENDING_TTL_HOURS)->toIso8601String(),
        ], 201);
    }
}
