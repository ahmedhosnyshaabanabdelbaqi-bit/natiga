<?php

/*
 * Strings used by the shared UI kit (resources/js/components/shared).
 * Generic actions/labels/states live in core.php; this file only holds
 * component-specific copy. Keys must stay identical to lang/ar/ui.php.
 */
return [
    'password' => ['show' => 'Show password', 'hide' => 'Hide password'],
    'table' => [
        'columns' => 'Columns', 'select_all' => 'Select all rows', 'select_row' => 'Select row', 'selected' => ':count selected',
        'clear_selection' => 'Clear selection', 'sort_by' => 'Sort by :column', 'rows_per_page' => 'Rows per page', 'toggle_columns' => 'Toggle columns',
        'loading' => 'Loading rows…', 'open' => 'Open',
    ],
    'filters' => [
        'title' => 'Filters', 'active' => ':count active', 'apply' => 'Apply filters', 'clear' => 'Clear :label', 'all' => 'All',
        'search' => 'Search…', 'from' => 'From', 'to' => 'To', 'yes' => 'Yes', 'no' => 'No', 'select' => 'Select…', 'open' => 'Open filters',
        'active_filters' => 'Active filters',
    ],
    'pagination' => ['label' => 'Pagination', 'previous' => 'Previous page', 'next' => 'Next page', 'page' => 'Page :page', 'more' => 'More pages'],
    'confirm' => ['reason_label' => 'Reason', 'reason_placeholder' => 'Explain why (at least 5 characters)…'],
    'upload' => [
        'drop' => 'Drag and drop files here, or', 'browse' => 'browse', 'single_drop' => 'Drag and drop a file here, or', 'max_size' => 'Max :size MB per file',
        'accepted' => 'Accepted: :types', 'too_large' => '":name" exceeds :size MB', 'too_many' => 'You can upload up to :count files', 'not_accepted' => '":name" is not an accepted file type',
        'remove' => 'Remove :name', 'preview' => 'Preview of :name', 'files_count' => ':count file|:count files', 'dropzone' => 'File upload area',
        'max_files' => 'Up to :count files', 'size_kb' => ':size KB', 'size_mb' => ':size MB', 'release' => 'Release to add the files', 'selected' => 'Selected files',
    ],
    'qr' => [
        'loading' => 'Loading scanner…', 'starting' => 'Starting camera…', 'permission_denied' => 'Camera access was denied. Allow camera access in your browser settings or enter the code manually.',
        'unsupported' => 'Camera scanning is not supported on this device. Enter the code manually.', 'error' => 'Could not start the camera. Try another camera or enter the code manually.',
        'insecure' => 'The camera requires a secure (HTTPS) connection. Enter the code manually.',
        'camera' => 'Camera', 'torch_on' => 'Turn torch on', 'torch_off' => 'Turn torch off', 'manual_label' => 'Or enter the code manually', 'manual_placeholder' => 'Code',
        'manual_submit' => 'Submit code', 'paused' => 'Scanner paused', 'retry' => 'Try again', 'viewfinder' => 'Point the camera at the QR code', 'scanned' => 'Code scanned',
        'stop' => 'Stop camera', 'start' => 'Start camera', 'camera_n' => 'Camera :number', 'region' => 'QR code scanner',
    ],
    'map' => [
        'attribution' => '© OpenStreetMap contributors', 'locate' => 'Use my location', 'locating' => 'Locating…', 'location_denied' => 'Location access was denied.',
        'location_unavailable' => 'Your location could not be determined.', 'location_unsupported' => 'Geolocation is not supported by this browser.',
        'cluster' => ':count locations, zoom in to expand', 'search_placeholder' => 'Search for an address…', 'search' => 'Search', 'no_results' => 'No addresses found',
        'latitude' => 'Latitude', 'longitude' => 'Longitude', 'drag_hint' => 'Drag the marker or click on the map to set the location.', 'marker' => 'Location marker',
        'selected_location' => 'Selected location', 'you_are_here' => 'You are here', 'loading' => 'Loading map…', 'results' => 'Search results',
        'region' => 'Map', 'zoom_in' => 'Zoom in', 'zoom_out' => 'Zoom out', 'searching' => 'Searching…', 'geocode_failed' => 'Address search failed. Try again or set the location on the map.',
        'invalid_coordinates' => 'Enter a valid latitude (-90 to 90) and longitude (-180 to 180).', 'close_popup' => 'Close',
    ],
    'command' => ['placeholder' => 'Type a command or search…', 'no_results' => 'No results found.', 'results' => 'Results', 'searching' => 'Searching…', 'open' => 'Search', 'title' => 'Command palette', 'description' => 'Search pages, records and actions', 'error' => 'Search failed. Try again.', 'shortcut' => 'Keyboard shortcut'],
    'rating' => ['label' => 'Rating', 'star' => ':count of :max stars', 'value' => ':value of :max', 'clear' => 'Clear rating'],
    'progress' => ['of' => ':value of :max', 'percent' => ':percent%'],
    'steps' => ['label' => 'Progress', 'step' => 'Step :number', 'done' => 'completed', 'current' => 'current step', 'pending' => 'pending'],
    'alert' => ['dismiss' => 'Dismiss'],
    'phone' => ['call' => 'Call :number', 'whatsapp' => 'WhatsApp :number'],
    'timeline' => ['by' => 'by :actor', 'label' => 'History'],
    'copy' => ['aria' => 'Copy :label'],
    'breadcrumb' => ['label' => 'Breadcrumb', 'more' => 'More'],
    'sidebar' => ['title' => 'Navigation menu', 'description' => 'Main navigation for this portal', 'toggle' => 'Toggle sidebar'],
];
