<?php

return [
    'kinds' => ['image' => 'Image', 'document' => 'Document', 'spreadsheet' => 'Spreadsheet'],
    'errors' => [
        'upload_failed' => 'The file could not be uploaded. Please try again.',
        'empty' => 'The file is empty.',
        'too_large' => 'The file exceeds the maximum size of :max MB.',
        'mime_not_allowed' => 'This file type (:mime) is not allowed.',
        'extension_missing' => 'The file name must have an extension.',
        'extension_not_allowed' => 'Files with the extension .:extension are not allowed. Allowed: :allowed.',
        'mime_mismatch' => 'The file content does not match its extension (.:extension).',
        'image_invalid' => 'The image could not be read. Upload a valid JPEG, PNG or WebP image.',
        'image_too_large' => 'The image dimensions are too large (maximum :max megapixels).',
        'not_owner_of_upload' => 'You can only attach files you uploaded yourself.',
        'already_claimed' => 'This file is already attached to another record.',
        'variant_missing' => 'This size is not available for this file.',
        'not_found' => 'File not found.',
    ],
    'upload' => [
        'drop_here' => 'Drop a file here or click to browse',
        'browse' => 'Choose file',
        'selected' => 'Selected file',
        'uploading' => 'Uploading…',
        'remove' => 'Remove file',
        'allowed' => 'Allowed: :types (max :max MB)',
        'replace' => 'Replace',
    ],
];
