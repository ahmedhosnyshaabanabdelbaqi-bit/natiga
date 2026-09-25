import type { TFunction } from 'i18next';
import { CLIENT_ERROR_CODES, isApiError } from './errors';

/** Human-readable, localized title/message for any thrown error. */
export function describeError(
  error: unknown,
  t: TFunction | ((key: string, opts?: Record<string, unknown>) => string),
): { title: string; message: string; requestId?: string | undefined } {
  const tt = t as (key: string, opts?: Record<string, unknown>) => string;
  if (!isApiError(error)) {
    return {
      title: tt('common:errors.unexpectedTitle'),
      message: error instanceof Error ? error.message : tt('common:errors.unexpected'),
    };
  }
  const requestId = error.requestId;
  if (error.code === CLIENT_ERROR_CODES.network) {
    return { title: tt('common:errors.networkTitle'), message: tt('common:errors.network') };
  }
  if (error.code === CLIENT_ERROR_CODES.sessionExpired) {
    return {
      title: tt('common:errors.sessionExpiredTitle'),
      message: tt('common:errors.sessionExpired'),
    };
  }
  if (error.isForbidden) {
    return {
      title: tt('common:errors.forbiddenTitle'),
      message: error.message || tt('common:errors.forbidden'),
      requestId,
    };
  }
  if (error.isNotFound) {
    return {
      title: tt('common:errors.notFoundTitle'),
      message: error.message || tt('common:errors.notFound'),
      requestId,
    };
  }
  if (error.isNotConfigured) {
    return { title: tt('common:errors.notConfiguredTitle'), message: error.message, requestId };
  }
  if (error.isValidation) {
    return { title: tt('common:errors.validationTitle'), message: error.message, requestId };
  }
  if (error.status === 429) {
    return {
      title: tt('common:errors.rateLimitedTitle'),
      message: tt('common:errors.rateLimited'),
      requestId,
    };
  }
  if (error.status >= 500) {
    return {
      title: tt('common:errors.serverTitle'),
      message: error.message.startsWith('HTTP ') ? tt('common:errors.server') : error.message,
      requestId,
    };
  }
  return {
    title: tt('common:errors.unexpectedTitle'),
    message: error.message.startsWith('HTTP ') ? tt('common:errors.unexpected') : error.message,
    requestId,
  };
}
