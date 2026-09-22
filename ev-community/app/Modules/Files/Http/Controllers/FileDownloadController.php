<?php

namespace App\Modules\Files\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Files\Models\Attachment;
use App\Modules\Files\Services\AttachmentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * GET /files/{attachment}?variant=thumb|medium|large  (route: shared.files.download)
 *
 * Authorization (AttachmentPolicy::view): uploader, owner-authorized user or `files.manage`.
 */
class FileDownloadController extends Controller
{
    public function __construct(private readonly AttachmentService $attachments) {}

    public function __invoke(Request $request, Attachment $attachment): StreamedResponse
    {
        Gate::authorize('view', $attachment);

        $variant = $request->query('variant');
        if ($variant !== null && ! array_key_exists((string) $variant, AttachmentService::VARIANTS)) {
            abort(404, __('files.errors.variant_missing'));
        }

        return $this->attachments->response($attachment, $variant === null ? null : (string) $variant);
    }
}
