/**
 * Server message catalog — English. Keys are "<namespace>.<key>"; values
 * may contain {placeholders}. ar.ts must have exactly the same keys and
 * placeholders (enforced by catalogs.spec.ts). Admins can override any
 * entry per locale through /api/v1/admin/translations.
 */
export const EN: Record<string, string> = {
  // --- generic errors (same codes as src/common/errors/error-codes.ts) ---------
  'errors.BAD_REQUEST': 'The request is invalid.',
  'errors.INVALID_JSON': 'The request body is not valid JSON.',
  'errors.VALIDATION_FAILED': 'Some fields are invalid. See details.',
  'errors.UNAUTHORIZED': 'Authentication is required.',
  'errors.TOKEN_EXPIRED': 'The access token has expired.',
  'errors.FORBIDDEN': 'You do not have permission to perform this action.',
  'errors.NOT_FOUND': 'The requested resource was not found.',
  'errors.METHOD_NOT_ALLOWED': 'Method not allowed.',
  'errors.CONFLICT': 'The request conflicts with existing data.',
  'errors.GONE': 'This resource is no longer available.',
  'errors.PAYLOAD_TOO_LARGE': 'The payload is too large.',
  'errors.UNSUPPORTED_MEDIA_TYPE': 'Unsupported media type.',
  'errors.PRECONDITION_FAILED': 'The resource changed since it was read.',
  'errors.RATE_LIMITED': 'Too many requests. Please try again shortly.',
  'errors.INTEGRATION_NOT_CONFIGURED': 'This integration is not configured.',
  'errors.SERVICE_UNAVAILABLE': 'The service is currently unavailable.',
  'errors.UPSTREAM_ERROR': 'An external service could not be reached.',
  'errors.NOT_IMPLEMENTED': 'This feature is not implemented yet.',
  'errors.INTERNAL_ERROR': 'An unexpected error occurred.',

  // --- platform errors -----------------------------------------------------------
  'errors.SETTING_UNKNOWN': 'Unknown setting "{key}".',
  'errors.SETTING_INVALID': 'Invalid value for the setting "{key}". See details.',
  'errors.DEFAULT_MARKET_INVALID': 'The default market must be an existing, enabled market.',
  'errors.LOGO_INVALID':
    'The logo must be a PNG, JPEG or WebP image of at least {min}×{min} pixels.',
  'errors.LOGO_TOO_LARGE': 'The logo file is larger than {maxKb} KB.',
  'errors.MARKET_EXISTS': 'A market with the code {code} already exists.',
  'errors.MARKET_IS_DEFAULT':
    'The default market cannot be disabled or deleted. Choose another default market first.',
  'errors.MARKET_IN_USE':
    'The market {code} is used by existing data; disable it instead of deleting it.',
  'errors.CURRENCY_EXISTS': 'A currency with the code {code} already exists.',
  'errors.CURRENCY_NOT_FOUND': 'The currency {code} does not exist.',
  'errors.CURRENCY_IN_USE':
    'The currency {code} is used by markets, prices or tariffs and cannot be deleted.',
  'errors.TIMEZONE_INVALID':
    'Unknown time zone "{timezone}" (use an IANA name such as Africa/Cairo).',
  'errors.TRANSLATION_EXISTS': 'An override for this key and language already exists.',
  'errors.TRANSLATION_KEY_UNKNOWN': 'The server message "{key}" does not exist.',
  'errors.TRANSLATION_PLACEHOLDERS_MISMATCH':
    'The text must use exactly these placeholders: {placeholders}.',
  'errors.JOBS_UNAVAILABLE':
    'Background jobs are unavailable: Redis cannot be reached. Please retry later.',
  'errors.JOB_NOT_FAILED': 'Only failed jobs can be retried.',
  'errors.JOB_ACTIVE': 'A running job cannot be removed.',
  'errors.IMPORT_TYPE_INVALID': 'Invalid import job type.',
  'errors.IMPORT_JOB_CANCELLED': 'The import job was cancelled.',
  'errors.IMPORT_JOB_FINISHED': 'The import job has already finished.',
  'errors.FEED_URL_NOT_ALLOWED': 'Feed URL not allowed: it must be https on a public address.',
  'errors.FEED_INVALID': 'The response is not a valid RSS or Atom feed.',
  'errors.ROUTE_NOT_FOUND': 'No driving route could be found between these points.',
  'errors.SOURCE_NOT_SYNCABLE': 'This station source has nothing to synchronise.',

  // --- notifications (title/body pairs) --------------------------------------------
  'notifications.article_published.title': 'New story about {subject}',
  'notifications.article_published.body': '{title}',
  'notifications.new_vehicle.title': 'New in the catalog: {car}',
  'notifications.new_vehicle.body': '{summary}',
  'notifications.price_changed.title': 'Price update for {car}',
  'notifications.price_changed.body':
    'New price in {market}: {price} ({priceType}), effective {date}.',
  'notifications.tour_published.title': 'New 360° tour: {car}',
  'notifications.tour_published.body': 'Look inside the {car} ({trim}).',
  'notifications.reminder_due.title': 'Reminder: {title}',
  'notifications.reminder_due.body': '{title} for your {car} is due on {date}.',
  'notifications.station_report_update.title': 'Update on your report',
  'notifications.station_report_update.body': 'Your report about {station} is now: {status}.',
  'notifications.comment_reply.title': 'New reply to your comment',
  'notifications.comment_reply.body': '{author}: {excerpt}',
  'notifications.answer_posted.title': 'New answer to your question',
  'notifications.answer_posted.body': '{excerpt}',

  // --- labels used inside notifications / e-mails ----------------------------------
  'labels.not_available': 'Not available',
  'labels.price_type.official_msrp': 'official price',
  'labels.price_type.dealer': 'dealer price',
  'labels.price_type.market_estimate': 'market estimate',
  'labels.price.converted_estimate': 'Estimated after currency conversion',
  'labels.report_status.open': 'open',
  'labels.report_status.in_review': 'under review',
  'labels.report_status.resolved': 'resolved',
  'labels.report_status.rejected': 'rejected',
  'labels.availability.unknown': 'Live status unknown',
};
